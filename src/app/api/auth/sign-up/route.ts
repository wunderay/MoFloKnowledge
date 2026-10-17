import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "../../../../lib/supabase/server";
import { appOrigin } from "../../../../lib/config/server";
import {
  assertWriteOrigin,
  readJson,
  json,
  HttpError,
} from "../../../../server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const id = randomUUID();
  try {
    assertWriteOrigin(request);
    const body = await readJson(
      request,
      z
        .object({
          email: z.string().email().max(320),
          password: z.string().min(8).max(72),
          confirmPassword: z.string().optional(),
        })
        .strict(),
    );
    const client = await createClient();
    const { data, error } = await client.auth.signUp({
      email: body.email,
      password: body.password,
      options: { emailRedirectTo: `${appOrigin()}/auth/callback` },
    });
    if (error) {
      // An existing account gets the same answer as a new one awaiting confirmation (no enumeration).
      if (error.code === "user_already_exists")
        return json({ signedUp: true, signedIn: false }, id);
      if (error.status === 429)
        throw new HttpError(
          429,
          "rate_limited",
          "Too many sign-up attempts. Please try again later.",
        );
      if (
        !error.status ||
        error.status >= 500 ||
        error.name === "AuthRetryableFetchError"
      )
        throw new HttpError(
          503,
          "unavailable",
          "Sign-up is temporarily unavailable.",
        );
      throw new HttpError(
        422,
        "invalid_password",
        "Unable to create an account with those details. Try a stronger password.",
      );
    }
    return json({ signedUp: true, signedIn: Boolean(data?.session) }, id);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return Response.json(
      {
        data: null,
        error: {
          code: "sign_up_failed",
          message:
            error instanceof HttpError
              ? error.message
              : "Sign-up is temporarily unavailable.",
        },
        requestId: id,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
