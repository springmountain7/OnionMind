import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noteImages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, jsonError } from "@/lib/http";
import { idSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await requireUser();
    const id = idSchema.parse((await context.params).id);
    const rows = await db
      .select({ imageData: noteImages.imageData, mimeType: noteImages.mimeType })
      .from(noteImages)
      .where(and(eq(noteImages.id, id), eq(noteImages.userId, user.id)))
      .limit(1);
    if (!rows[0]) throw new AppError(404, "IMAGE_NOT_FOUND", "照片不存在。");
    return new NextResponse(new Uint8Array(rows[0].imageData), {
      headers: {
        "Content-Type": rows[0].mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
