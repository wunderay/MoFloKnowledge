import { z } from "zod";
import { IdSchema, GenerationSchema } from "./api-common";
export const PublishSchema = z
  .object({ expectedGeneration: GenerationSchema, requestId: IdSchema })
  .strict();
