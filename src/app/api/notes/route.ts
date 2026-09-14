import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { noteImages, notes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { noteInputSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const [rows, images] = await Promise.all([
      db.select().from(notes).where(eq(notes.userId, user.id)).orderBy(desc(notes.updatedAt)),
      db
        .select({ id: noteImages.id, noteId: noteImages.noteId, mimeType: noteImages.mimeType })
        .from(noteImages)
        .where(eq(noteImages.userId, user.id))
    ]);
    return NextResponse.json({
      notes: rows.map((note) => ({
        ...note,
        images: images
          .filter((image) => image.noteId === note.id)
          .map((image) => ({ ...image, url: `/api/images/${image.id}` }))
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = noteInputSchema.parse(await request.json());
    const now = new Date();
    const note = {
      id: randomUUID(),
      userId: user.id,
      title: input.title || null,
      body: input.body,
      createdAt: now,
      updatedAt: now
    };
    await db.insert(notes).values(note);
    return NextResponse.json({ note: { ...note, images: [] } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
