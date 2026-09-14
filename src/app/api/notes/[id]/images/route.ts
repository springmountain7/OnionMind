import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noteImages, notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, jsonError } from "@/lib/http";
import { optimizeImage } from "@/lib/images";
import { detectSupportedImage, idSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireUser();
    const noteId = idSchema.parse((await context.params).id);
    const owned = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)))
      .limit(1);
    if (!owned[0]) throw new AppError(404, "NOTE_NOT_FOUND", "笔记不存在。");
    const existing = await db
      .select({ value: count() })
      .from(noteImages)
      .where(and(eq(noteImages.noteId, noteId), eq(noteImages.userId, user.id)));
    if ((existing[0]?.value ?? 0) >= 3) throw new AppError(400, "IMAGE_LIMIT", "每篇笔记最多上传 3 张照片。");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "IMAGE_REQUIRED", "请选择一张照片。");
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new AppError(400, "IMAGE_SIZE", "照片大小必须在 5 MB 以内。");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectSupportedImage(bytes);
    if (!detected) throw new AppError(400, "IMAGE_TYPE", "仅支持 JPEG、PNG 和 WebP 照片。");
    const imageId = randomUUID();
    const optimized = await optimizeImage(bytes);
    await db.insert(noteImages).values({
      id: imageId,
      noteId,
      userId: user.id,
      imageData: optimized.data,
      mimeType: "image/webp",
      sizeBytes: optimized.data.length,
      createdAt: new Date()
    });
    return NextResponse.json(
      { image: { id: imageId, noteId, mimeType: "image/webp", url: `/api/images/${imageId}` } },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
