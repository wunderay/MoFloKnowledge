import { z } from "zod";
import {
  UUIDSchema,
  NullableTextSchema as text,
  URLSchema,
  collection,
} from "./primitives";
import { IdentifiedTextSchema } from "./value-types";
import { PricingSchema } from "./numeric-values";
import { OfferingImageSchema, MAX_OFFERING_IMAGES } from "./storage-ref";
export const OfferingSchema = z
  .object({
    id: UUIDSchema,
    name: text,
    description: text,
    offering_type: text,
    category: text,
    features: collection(IdentifiedTextSchema),
    pricing: PricingSchema.nullable(),
    url: URLSchema.nullable(),
    images: collection(OfferingImageSchema, MAX_OFFERING_IMAGES),
  })
  .strict()
  .refine(
    (v) =>
      v.name !== null ||
      v.description !== null ||
      v.offering_type !== null ||
      v.category !== null ||
      v.features.length > 0 ||
      v.pricing !== null ||
      v.url !== null ||
      v.images.length > 0,
    "Cannot create wholly empty offering",
  );
export type Offering = z.infer<typeof OfferingSchema>;
