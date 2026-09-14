import sharp from "sharp";
import { AppError } from "@/lib/http";

export const MAX_STORED_IMAGE_BYTES = 1024 * 1024;

const compressionSteps = [
  { maxEdge: 1600, quality: 80 },
  { maxEdge: 1600, quality: 70 },
  { maxEdge: 1400, quality: 65 },
  { maxEdge: 1200, quality: 60 },
  { maxEdge: 1000, quality: 55 },
  { maxEdge: 800, quality: 50 }
];

export async function optimizeImage(bytes: Uint8Array) {
  try {
    for (const step of compressionSteps) {
      const data = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: step.maxEdge,
          height: step.maxEdge,
          fit: "inside",
          withoutEnlargement: true
        })
        .webp({ quality: step.quality, effort: 4, smartSubsample: true })
        .toBuffer();

      if (data.length <= MAX_STORED_IMAGE_BYTES) return { data };
    }
  } catch {
    throw new AppError(400, "IMAGE_INVALID", "照片文件损坏或无法处理。");
  }

  throw new AppError(400, "IMAGE_COMPRESS_FAILED", "照片内容过于复杂，请换一张照片后重试。");
}
