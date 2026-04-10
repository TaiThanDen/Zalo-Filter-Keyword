import { cookies } from "next/headers";
import { AppError } from "@/src/lib/errors";
import { verifyPassword } from "@/src/lib/crypto";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { authRepository } from "@/src/modules/auth/auth.repository";
import { createSessionRecord, destroySessionCookie, getSessionTokenFromCookies, setSessionCookie } from "@/src/server/session/session";
import type { AuthenticatedUser } from "@/src/types/auth";

function toAuthenticatedUser(user: { id: string; email: string; role: "ADMIN" }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  } satisfies AuthenticatedUser;
}

export async function loginWithPassword(input: { email: string; password: string }) {
  const user = await authRepository.findUserByEmail(input.email);

  if (!user || !user.isActive) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const session = await createSessionRecord(user.id, IMPLEMENTATION_DEFAULTS.sessionTtlMs);
  await setSessionCookie(session.token);

  return toAuthenticatedUser({ id: user.id, email: user.email, role: user.role });
}

export async function logoutCurrentUser() {
  const token = await getSessionTokenFromCookies();

  if (token) {
    await authRepository.deleteSessionByTokenHash(token.tokenHash);
  }

  await destroySessionCookie();
}

export async function getCurrentUser() {
  const token = await getSessionTokenFromCookies();

  if (!token) {
    return null;
  }

  const session = await authRepository.findSessionByTokenHash(token.tokenHash);

  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
    await destroySessionCookie();
    return null;
  }

  await authRepository.touchSession(token.tokenHash, new Date());

  return toAuthenticatedUser({
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }

  return user;
}

export async function getCurrentUserFromRequestCookie() {
  const cookieStore = await cookies();
  return cookieStore.getAll();
}
