import { z } from "zod";
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
export const IdSchema = z.string().uuid();
export const GenerationSchema = z.number().int().nonnegative().safe();
