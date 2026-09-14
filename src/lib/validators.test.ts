import { describe, expect, it } from "vitest";
import {
  assertOnlyKnownSourceIds,
  detectSupportedImage,
  feedbackDataSchema,
  noteInputSchema,
  noteUpdateSchema
} from "./validators";

describe("image validation", () => {
  it("detects supported magic bytes", () => {
    expect(detectSupportedImage(Uint8Array.from([0xff, 0xd8, 0xff]))?.mimeType).toBe("image/jpeg");
    expect(detectSupportedImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType).toBe("image/png");
    expect(detectSupportedImage(new TextEncoder().encode("RIFFxxxxWEBP"))?.mimeType).toBe("image/webp");
  });

  it("rejects content that only claims an image MIME type", () => {
    expect(detectSupportedImage(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
});

describe("structured output validation", () => {
  const sourceId = "1ce03eac-2d65-4e92-b762-080142bcc703";
  const validFeedback = {
    theme: "学习选择",
    observations: [{ text: "多次记录了目标变化", sourceIds: [sourceId] }],
    hypotheses: [{ text: "一种可能是目标尚未内化", support: "中", sourceIds: [sourceId] }],
    alternatives: ["也可能只是近期精力不足"],
    uncertainties: ["尚不清楚时间投入"],
    keyQuestion: "如果没有外部评价，你还会选择它吗？",
    nextAction: "记录一次不受评价影响的小选择"
  };

  it("accepts the intended feedback shape", () => {
    expect(feedbackDataSchema.parse(validFeedback).theme).toBe("学习选择");
  });

  it("rejects invented source ids", () => {
    expect(() => assertOnlyKnownSourceIds(validFeedback, new Set())).toThrow("unknown sourceId");
    expect(() => assertOnlyKnownSourceIds(validFeedback, new Set([sourceId]))).not.toThrow();
  });
});

describe("note validation", () => {
  it("trims and requires body text", () => {
    expect(noteInputSchema.parse({ title: " 标题 ", body: " 内容 " })).toEqual({ title: "标题", body: "内容" });
    expect(() => noteInputSchema.parse({ body: "   " })).toThrow();
  });

  it("keeps old update payloads compatible and validates image removals", () => {
    const imageId = "1ce03eac-2d65-4e92-b762-080142bcc703";
    expect(noteUpdateSchema.parse({ body: "内容" })).toEqual({ body: "内容" });
    expect(noteUpdateSchema.parse({ body: "内容", removeImageIds: [imageId] }).removeImageIds).toEqual([imageId]);
    expect(() => noteUpdateSchema.parse({ body: "内容", removeImageIds: [imageId, imageId] })).toThrow();
  });
});
