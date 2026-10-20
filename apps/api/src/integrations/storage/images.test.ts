import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage, UnsupportedImageError } from "./images";

function photo(width: number, height: number, format: "jpeg" | "png" = "jpeg") {
  const image = sharp({ create: { width, height, channels: 3, background: "#c8f169" } });
  return (format === "jpeg" ? image.jpeg() : image.png())
    .withExif({ IFD0: { Copyright: "secret", Make: "Phone" }, IFD3: { GPSLatitudeRef: "N" } })
    .toBuffer();
}

describe("processImage", () => {
  it("re-encodes to WebP within the size limit and keeps the aspect ratio", async () => {
    const result = await processImage(await photo(4000, 3000), "photo");

    const main = await sharp(result.main.data).metadata();
    expect(main.format).toBe("webp");
    expect([result.main.width, result.main.height]).toEqual([1600, 1200]);
    expect([result.thumbnail.width, result.thumbnail.height]).toEqual([400, 300]);
  });

  it("strips EXIF, including location", async () => {
    const result = await processImage(await photo(800, 600), "photo");

    for (const data of [result.main.data, result.thumbnail.data]) {
      const metadata = await sharp(data).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    }
  });

  it("doesn't enlarge small images and sizes avatars at 512 px", async () => {
    const small = await processImage(await photo(300, 200, "png"), "avatar");
    const large = await processImage(await photo(2000, 2000), "avatar");

    expect([small.main.width, small.main.height]).toEqual([300, 200]);
    expect([large.main.width, large.thumbnail.width]).toEqual([512, 128]);
  });

  it("checks the real bytes, not the claimed type", async () => {
    await expect(
      processImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "photo"),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(
      processImage(Buffer.from("definitely not an image"), "photo"),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } })
      .gif()
      .toBuffer();
    await expect(processImage(gif, "photo")).rejects.toMatchObject({ detectedFormat: "gif" });
  });

  it("returns a checksum of the stored bytes", async () => {
    const result = await processImage(await photo(100, 100), "avatar");

    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
