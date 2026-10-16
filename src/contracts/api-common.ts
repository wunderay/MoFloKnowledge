import { z } from "zod";
export const ApiErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
  requestId: string;
};
export const IdSchema = z.string().uuid();
export const GenerationSchema = z.number().int().nonnegative().safe();
export const RequestSchema = z.object({ requestId: IdSchema }).strict();
