import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/src/config/env";

const dashboardPrefixes = ["/dashboard", "/groups", "/rules", "/channels", "/logs", "/watchers"];

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(env.SESSION_COOKIE_NAME)?.value;
  const pathname = request.nextUrl.pathname;

  const isDashboardPath = dashboardPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!sessionToken && isDashboardPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/groups/:path*", "/rules/:path*", "/channels/:path*", "/logs/:path*", "/watchers/:path*", "/login"],
};
