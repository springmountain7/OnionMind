import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { zhihuItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await db
      .select()
      .from(zhihuItems)
      .where(eq(zhihuItems.userId, user.id))
      .orderBy(desc(zhihuItems.favoriteAt), desc(zhihuItems.syncedAt))
      .limit(50);
    return NextResponse.json({ items });
  } catch (error) {
    return jsonError(error);
  }
}
