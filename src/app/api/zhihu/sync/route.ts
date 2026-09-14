import { db } from "@/db";
import { zhihuItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { fetchRecentCollections } from "@/lib/zhihu";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const user = await requireUser();
    const items = await fetchRecentCollections(user.id);
    const now = new Date();
    for (const item of items) {
      await db
        .insert(zhihuItems)
        .values({ ...item, userId: user.id, syncedAt: now, createdAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({
          set: {
            sourceUrl: item.sourceUrl,
            contentType: item.contentType,
            title: item.title,
            summary: item.summary,
            authorName: item.authorName,
            favoriteAt: item.favoriteAt,
            syncedAt: now,
            updatedAt: now
          }
        });
    }
    return NextResponse.json({ ok: true, synced: items.length, syncedAt: now });
  } catch (error) {
    return jsonError(error);
  }
}
