import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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
export async function verifiedSession() {
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
}
