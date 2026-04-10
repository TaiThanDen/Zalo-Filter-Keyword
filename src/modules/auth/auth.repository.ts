import { db } from "@/src/lib/db";

export const authRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email } });
  },
  findUserById(id: string) {
    return db.user.findUnique({ where: { id } });
  },
  findSessionByTokenHash(tokenHash: string) {
    return db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  },
  createSession(userId: string, tokenHash: string, expiresAt: Date) {
    return db.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  },
  deleteSessionByTokenHash(tokenHash: string) {
    return db.session.deleteMany({ where: { tokenHash } });
  },
  touchSession(tokenHash: string, lastSeenAt: Date) {
    return db.session.update({
      where: { tokenHash },
      data: { lastSeenAt },
    });
  },
};
