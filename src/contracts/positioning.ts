import { z } from "zod";
import { NullableTextSchema as text } from "./primitives";
export const PositioningSchema = z
  .object({ company_pitch: text, founding_story: text })
  .strict();
export type Positioning = z.infer<typeof PositioningSchema>;
