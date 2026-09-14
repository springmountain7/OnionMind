import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { memoryCards, zhihuItems } from "@/db/schema";
import { callDeepSeekJson, claimGenerationCooldown, memoryCardsPrompt } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { AppError, jsonError } from "@/lib/http";
import { idSchema, memoryCardsResponseSchema } from "@/lib/validators";

const inputSchema = z.object({ itemIds: z.array(idSchema).min(1).max(5) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = inputSchema.parse(await request.json());
    const itemIds = [...new Set(input.itemIds)];
    if (itemIds.length !== input.itemIds.length) throw new AppError(400, "DUPLICATE_SOURCE", "不能重复选择同一条收藏。");
    const sources = await db
      .select({
        id: zhihuItems.id,
        title: zhihuItems.title,
        summary: zhihuItems.summary,
        authorName: zhihuItems.authorName,
        sourceUrl: zhihuItems.sourceUrl
      })
      .from(zhihuItems)
      .where(and(eq(zhihuItems.userId, user.id), inArray(zhihuItems.id, itemIds)));
    if (sources.length !== itemIds.length) throw new AppError(404, "SOURCE_NOT_FOUND", "部分收藏不存在或不属于当前用户。");
    await claimGenerationCooldown(user.id, "cards");
    const model = getEnv().DEEPSEEK_CARD_MODEL;
    const result = await callDeepSeekJson({
      userId: user.id,
      kind: "cards",
      model,
      messages: memoryCardsPrompt(sources),
      schema: memoryCardsResponseSchema,
      knownSourceIds: new Set(itemIds)
    });
    const generatedIds = new Set(result.cards.map((card) => card.sourceId));
    if (generatedIds.size !== itemIds.length || itemIds.some((id) => !generatedIds.has(id))) {
      throw new AppError(502, "AI_INCOMPLETE_RESPONSE", "AI 没有为每条所选收藏生成且仅生成一张卡片。");
    }
    const now = new Date();
    for (const card of result.cards) {
      const data = {
        coreClaim: card.coreClaim,
        evidence: card.evidence,
        conditions: card.conditions,
        counterpoints: card.counterpoints,
        question: card.question,
        keywords: card.keywords
      };
      await db
        .insert(memoryCards)
        .values({
          id: randomUUID(),
          userId: user.id,
          sourceItemId: card.sourceId,
          data,
          model,
          createdAt: now,
          updatedAt: now
        })
        .onDuplicateKeyUpdate({ set: { data, model, updatedAt: now } });
    }
    return NextResponse.json({ ok: true, generated: result.cards.length });
  } catch (error) {
    return jsonError(error);
  }
}
