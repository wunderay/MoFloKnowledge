import { createClient } from "../../../lib/supabase/server";
import { appOrigin } from "../../../lib/config/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(`${appOrigin()}/dashboard`, 303);
  }
  return Response.redirect(`${appOrigin()}/sign-in?error=callback`, 303);
}
