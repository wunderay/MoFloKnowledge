import { z } from "zod";
import { collection } from "./primitives";
import { SocialLinkSchema } from "./value-types";
export const OnlinePresenceSchema = z
  .object({ social_media_links: collection(SocialLinkSchema) })
  .strict();
export type OnlinePresence = z.infer<typeof OnlinePresenceSchema>;
