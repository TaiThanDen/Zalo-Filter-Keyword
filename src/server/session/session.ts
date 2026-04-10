import { cookies } from "next/headers";
import { env } from "@/src/config/env";
import { createRandomToken, sha256 } from "@/src/lib/crypto";
import { getSessionCookieOptions } from "@/src/lib/cookies";
import { addMilliseconds, now } from "@/src/lib/time";
import { authRepository } from "@/src/modules/auth/auth.repository";

function hashSessionToken(token: string) {
  return sha256(`${token}:${env.SESSION_SECRET}`);
}

export async function createSessionRecord(userId: string, ttlMs: number) {
  const token = createRandomToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = addMilliseconds(now(), ttlMs);

  await authRepository.createSession(userId, tokenHash, expiresAt);

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  const options = getSessionCookieOptions();
  cookieStore.set(options.name, token, options);
}

export async function destroySessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function getSessionTokenFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return {
    token,
    tokenHash: hashSessionToken(token),
  };
}
