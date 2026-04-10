import { env } from "@/src/config/env";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";

export function getSessionCookieOptions() {
  return {
    name: env.SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(IMPLEMENTATION_DEFAULTS.sessionTtlMs / 1000),
  };
}
