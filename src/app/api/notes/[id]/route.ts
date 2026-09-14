import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noteImages, notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AppError, jsonError } from "@/lib/http";
import { idSchema, noteUpdateSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const user = await requireUser();
    const id = idSchema.parse((await context.params).id);
    const input = noteUpdateSchema.parse(await request.json());
    await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
        .limit(1);
      if (!owned[0]) throw new AppError(404, "NOTE_NOT_FOUND", "笔记不存在。");

      const removeImageIds = input.removeImageIds ?? [];
      if (removeImageIds.length > 0) {
        const ownedImages = await tx
          .select({ id: noteImages.id })
          .from(noteImages)
          .where(and(eq(noteImages.noteId, id), eq(noteImages.userId, user.id), inArray(noteImages.id, removeImageIds)));
        if (ownedImages.length !== removeImageIds.length) {
          throw new AppError(400, "IMAGE_NOT_FOUND", "待删除图片不属于这篇笔记。");
        }
      }

      await tx
        .update(notes)
        .set({ title: input.title || null, body: input.body, updatedAt: new Date() })
        .where(and(eq(notes.id, id), eq(notes.userId, user.id)));
      if (removeImageIds.length > 0) {
        await tx
          .delete(noteImages)
          .where(and(eq(noteImages.noteId, id), eq(noteImages.userId, user.id), inArray(noteImages.id, removeImageIds)));
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const user = await requireUser();
    const id = idSchema.parse((await context.params).id);
    const owned = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
      .limit(1);
    if (!owned[0]) throw new AppError(404, "NOTE_NOT_FOUND", "笔记不存在。");
    await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
