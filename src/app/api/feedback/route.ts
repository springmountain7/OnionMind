import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const reports = await db
      .select()
      .from(feedbackReports)
      .where(eq(feedbackReports.userId, user.id))
      .orderBy(desc(feedbackReports.createdAt))
      .limit(10);
    return NextResponse.json({ reports });
  } catch (error) {
    return jsonError(error);
  }
}
