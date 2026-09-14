import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { feedbackReports, memoryCards, notes, zhihuItems } from "@/db/schema";
import { callDeepSeekJson, claimGenerationCooldown, feedbackPrompt } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { AppError, jsonError } from "@/lib/http";
import { feedbackDataSchema, idSchema } from "@/lib/validators";

const sourceSchema = z.object({ type: z.enum(["note", "card"]), id: idSchema });
const inputSchema = z.object({ sources: z.array(sourceSchema).min(1).max(10) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = inputSchema.parse(await request.json());
    const sourceKeys = input.sources.map((source) => `${source.type}:${source.id}`);
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      throw new AppError(400, "DUPLICATE_SOURCE", "不能重复选择同一份材料。");
    }
    const noteIds = input.sources.filter((source) => source.type === "note").map((source) => source.id);
    const cardIds = input.sources.filter((source) => source.type === "card").map((source) => source.id);
    const noteRows = noteIds.length
      ? await db
          .select({ id: notes.id, title: notes.title, body: notes.body })
          .from(notes)
          .where(and(eq(notes.userId, user.id), inArray(notes.id, noteIds)))
      : [];
    const cardRows = cardIds.length
      ? await db
          .select({
            id: memoryCards.id,
            data: memoryCards.data,
            sourceTitle: zhihuItems.title,
            sourceUrl: zhihuItems.sourceUrl
          })
          .from(memoryCards)
          .innerJoin(zhihuItems, eq(memoryCards.sourceItemId, zhihuItems.id))
          .where(and(eq(memoryCards.userId, user.id), inArray(memoryCards.id, cardIds)))
      : [];
    if (noteRows.length !== noteIds.length || cardRows.length !== cardIds.length) {
      throw new AppError(404, "SOURCE_NOT_FOUND", "部分材料不存在或不属于当前用户。");
    }
    await claimGenerationCooldown(user.id, "feedback");
    const sources = [
      ...noteRows.map((note) => ({ id: note.id, type: "note" as const, content: { title: note.title, body: note.body } })),
      ...cardRows.map((card) => ({
        id: card.id,
        type: "card" as const,
        content: { sourceTitle: card.sourceTitle, sourceUrl: card.sourceUrl, ...card.data }
      }))
    ];
    const model = getEnv().DEEPSEEK_FEEDBACK_MODEL;
    const result = await callDeepSeekJson({
      userId: user.id,
      kind: "feedback",
      model,
      messages: feedbackPrompt(sources),
      schema: feedbackDataSchema,
      knownSourceIds: new Set(input.sources.map((source) => source.id))
    });
    const report = {
      id: randomUUID(),
      userId: user.id,
      sourceRefs: input.sources,
      data: result,
      model,
      createdAt: new Date()
    };
    await db.insert(feedbackReports).values(report);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
