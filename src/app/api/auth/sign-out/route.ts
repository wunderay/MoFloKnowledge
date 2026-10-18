import { route, HttpError } from "../../../../server/http";
export const runtime = "nodejs";
export const POST = route(async (_r, _c, { client }) => {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new HttpError(503, "unavailable", "Unable to sign out.");
  }
  return { signedOut: true };
});
