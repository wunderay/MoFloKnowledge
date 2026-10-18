import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicConfig } from "../config/server";
export async function createClient() {
  const store = await cookies();
  const { url, key } = publicConfig();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          try {
            store.set(name, value, options);
          } catch {
            /* Server components cannot refresh cookies; route handlers can. */
          }
        }
      },
    },
  });
}
// Cached per request so a layout and its page share one auth call.
export const verifiedSession = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (
    error &&
    (!error.status ||
      error.status >= 500 ||
      error.name === "AuthRetryableFetchError")
  ) {
    throw new Error("Authentication service is temporarily unavailable.");
  }
  return { client, user: error ? null : data.user };
});
