import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "../../../../lib/supabase/server";
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
          password: z.string().min(1).max(1024),
        })
        .strict(),
    );
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(body);
    if (error) {
      if (error.status === 429)
        throw new HttpError(
          429,
          "rate_limited",
          "Too many sign-in attempts. Please try again later.",
        );
      if (
        !error.status ||
        error.status >= 500 ||
        error.name === "AuthRetryableFetchError"
      )
        throw new HttpError(
          503,
          "unavailable",
          "Sign-in is temporarily unavailable.",
        );
      throw new HttpError(
        401,
        "invalid_credentials",
        "Unable to sign in with those credentials.",
      );
    }
    return json({ signedIn: true }, id);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return Response.json(
      {
        data: null,
        error: {
          code: "sign_in_failed",
          message:
            error instanceof HttpError
              ? error.message
              : "Sign-in is temporarily unavailable.",
        },
        requestId: id,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
