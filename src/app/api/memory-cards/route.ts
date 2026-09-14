import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { memoryCards, zhihuItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const cards = await db
      .select({
        id: memoryCards.id,
        sourceItemId: memoryCards.sourceItemId,
        data: memoryCards.data,
        model: memoryCards.model,
        createdAt: memoryCards.createdAt,
        updatedAt: memoryCards.updatedAt,
        sourceTitle: zhihuItems.title,
        sourceUrl: zhihuItems.sourceUrl,
        authorName: zhihuItems.authorName
      })
      .from(memoryCards)
      .innerJoin(zhihuItems, eq(memoryCards.sourceItemId, zhihuItems.id))
      .where(eq(memoryCards.userId, user.id))
      .orderBy(desc(memoryCards.updatedAt));
    return NextResponse.json({ cards });
  } catch (error) {
    return jsonError(error);
  }
}
