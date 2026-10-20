import { createHash } from "node:crypto";
import sharp from "sharp";

/** Output sizes per use (PROMPT §17.7): avatars 512 px, photos 1600 px; thumbnails for lists. */
export const IMAGE_PROFILES = {
  avatar: { maxSize: 512, thumbSize: 128 },
  photo: { maxSize: 1600, thumbSize: 400 },
} as const;
export type ImageProfile = keyof typeof IMAGE_PROFILES;

/** Formats decoded from the actual bytes — the client's Content-Type is never trusted. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
/** Refuse decompression bombs: 40 megapixels is well above any phone photo. */
const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 80;

export class UnsupportedImageError extends Error {
  constructor(readonly detectedFormat: string | undefined) {
    super(`unsupported image format: ${detectedFormat ?? "unknown"}`);
    this.name = "UnsupportedImageError";
  }
}

export interface ProcessedImage {
  main: { data: Buffer; width: number; height: number };
  thumbnail: { data: Buffer; width: number; height: number };
  /** SHA-256 of the processed main image. */
  checksum: string;
}

/**
 * Re-encodes an upload (CLAUDE.md "Cloudflare R2" rules): applies the EXIF orientation, then drops
 * all metadata — location included — because sharp writes none unless asked; WebP, bounded size,
 * plus a thumbnail. The original bytes are never stored.
 */
export async function processImage(input: Buffer, profile: ImageProfile): Promise<ProcessedImage> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new UnsupportedImageError(undefined);
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new UnsupportedImageError(metadata.format);
  }
  const { maxSize, thumbSize } = IMAGE_PROFILES[profile];

  const render = async (size: number) => {
    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };

  const [main, thumbnail] = await Promise.all([render(maxSize), render(thumbSize)]);
  return { main, thumbnail, checksum: createHash("sha256").update(main.data).digest("hex") };
}
