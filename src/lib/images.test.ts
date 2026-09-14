import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_STORED_IMAGE_BYTES, optimizeImage } from "./images";

describe("image optimization", () => {
  it("rotates, resizes and stores a bounded WebP", async () => {
    const input = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: { r: 92, g: 144, b: 103 } }
    })
      .jpeg()
      .toBuffer();

    const output = await optimizeImage(input);
    const metadata = await sharp(output.data).metadata();

    expect(metadata.format).toBe("webp");
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(output.data.length).toBeLessThanOrEqual(MAX_STORED_IMAGE_BYTES);
  });

  it("rejects corrupt image data", async () => {
    await expect(optimizeImage(new TextEncoder().encode("not-an-image"))).rejects.toMatchObject({
      code: "IMAGE_INVALID",
      status: 400
    });
  });
});
