import type { NextRequest } from "next/server";
import { refreshSession } from "./lib/supabase/middleware";
export function middleware(request: NextRequest) {
  return refreshSession(request);
}
export const config = {
  matcher: ["/dashboard/:path*", "/knowledge/:path*", "/api/companies/:path*"],
};
