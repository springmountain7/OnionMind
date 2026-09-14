import { z } from "zod";

export const idSchema = z.string().uuid();

export const noteInputSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().min(1, "笔记正文不能为空").max(30_000)
});

export const noteUpdateSchema = noteInputSchema.extend({
  removeImageIds: z.array(idSchema).max(3).refine((ids) => new Set(ids).size === ids.length, "图片 ID 不能重复").optional()
});

export const memoryCardDataSchema = z.object({
  sourceId: idSchema,
  coreClaim: z.string().trim().min(1).max(1000),
  evidence: z.array(z.string().trim().min(1).max(1000)).max(6),
  conditions: z.array(z.string().trim().min(1).max(1000)).max(6),
  counterpoints: z.array(z.string().trim().min(1).max(1000)).max(6),
  question: z.string().trim().min(1).max(1000),
  keywords: z.array(z.string().trim().min(1).max(50)).max(12)
});

export const memoryCardsResponseSchema = z.object({
  cards: z.array(memoryCardDataSchema).min(1).max(5)
});

const citedTextSchema = z.object({
  text: z.string().trim().min(1).max(1500),
  sourceIds: z.array(idSchema).min(1).max(10)
});

export const feedbackDataSchema = z.object({
  theme: z.string().trim().min(1).max(500),
  observations: z.array(citedTextSchema).max(8),
  hypotheses: z
    .array(citedTextSchema.extend({ support: z.enum(["弱", "中", "强"]) }))
    .max(6),
  alternatives: z.array(z.string().trim().min(1).max(1000)).max(6),
  uncertainties: z.array(z.string().trim().min(1).max(1000)).max(6),
  keyQuestion: z.string().trim().min(1).max(1000),
  nextAction: z.string().trim().min(1).max(1000)
});

export function assertOnlyKnownSourceIds(value: unknown, knownIds: Set<string>) {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, nested] of Object.entries(item)) {
      if (key === "sourceId" && typeof nested === "string" && !knownIds.has(nested)) {
        throw new Error("AI response referenced an unknown sourceId.");
      }
      if (key === "sourceIds" && Array.isArray(nested)) {
        for (const id of nested) {
          if (typeof id !== "string" || !knownIds.has(id)) {
            throw new Error("AI response referenced an unknown sourceId.");
          }
        }
      }
      visit(nested);
    }
  };
  visit(value);
}

export type SupportedImage = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" };

export function detectSupportedImage(bytes: Uint8Array): SupportedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}
