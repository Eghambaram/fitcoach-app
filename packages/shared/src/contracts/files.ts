import { z } from "zod";

/** Largest file the API accepts before processing (PROMPT §8.8: max 10 MB input). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Formats the API decodes. HEIC (iPhone default) isn't supported by the bundled image library yet;
 * iPhones convert to JPEG when "Most Compatible" is chosen or when sharing.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const uploadedPhotoResponseSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url(),
});
export type UploadedPhotoResponse = z.infer<typeof uploadedPhotoResponseSchema>;
