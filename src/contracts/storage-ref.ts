import { z } from "zod";
import { UUIDSchema } from "./primitives";
// A reference to a private knowledge-assets object. Paths are <folder>/<company uuid>/<object uuid>.<ext>, the shape the
// storage policies serve; the company segment must equal the owning company, which SQL and the snapshot export check
// (a per-entry schema cannot know the company). Branding logos keep their own `url` field.
export const IMAGE_CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
} as const;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const MAX_OFFERING_IMAGES = 20;
const UUID_PATH = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const storageRef = (folder: "portraits" | "offering-images") =>
  z
    .object({
      id: UUIDSchema,
      path: z
        .string()
        .regex(
          new RegExp(
            `^${folder}/${UUID_PATH}/${UUID_PATH}\\.(?:png|jpg|jpeg|gif|webp|svg)$`,
          ),
        ),
      content_type: z.enum([
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/svg+xml",
      ]),
      size_bytes: z.number().int().min(1).max(MAX_ASSET_BYTES),
    })
    .strict()
    .refine(
      (v) =>
        IMAGE_CONTENT_TYPES[
          v.path.slice(v.path.lastIndexOf(".") + 1) as keyof typeof IMAGE_CONTENT_TYPES
        ] === v.content_type,
      "Content type must match the file extension",
    );
export const PortraitSchema = storageRef("portraits");
export const OfferingImageSchema = storageRef("offering-images");
export type StorageRef = z.infer<typeof PortraitSchema>;
/** The company segment of a reference path (callers validate the shape first). */
export const storageRefCompany = (ref: { path: string }) => ref.path.split("/")[1];
