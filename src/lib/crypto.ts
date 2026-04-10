import { createHash, randomBytes } from "node:crypto";
import { compare as bcryptCompare, hash as bcryptHash } from "bcryptjs";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRandomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

export async function hashPassword(password: string) {
  return bcryptHash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcryptCompare(password, passwordHash);
}
