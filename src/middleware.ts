import type { NextRequest } from "next/server";
import { refreshSession } from "./lib/supabase/middleware";
export function middleware(request: NextRequest) {
  return refreshSession(request);
}
// Next 15 buffers the first 10 MiB of a request body for middleware and drops the rest, which would truncate a
// 10 MiB logo upload. The upload routes need no refresh here: they authenticate through verifiedSession(), which
// refreshes the session itself and may set cookies in a route handler, and they check the origin themselves.
export const config = {
  matcher: [
    "/knowledge/:path*",
    "/api/companies",
    "/api/companies/:companyId",
    "/api/companies/:companyId/((?!uploads(?:/|$)).*)",
  ],
};
