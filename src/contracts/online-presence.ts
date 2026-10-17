import { z } from "zod";
import { collection } from "./primitives";
import { SocialLinkSchema } from "./value-types";
export const OnlinePresenceSchema = z
  .object({
    social_media_links: collection(SocialLinkSchema),
    // Exactly ten ASCII digits, stored bare; documents format them as (555) 010-0199.
    phone: z.string().regex(/^[0-9]{10}$/).nullable(),
  })
  .strict();
export type OnlinePresence = z.infer<typeof OnlinePresenceSchema>;
