import { Prisma, MatchDecision } from "@prisma/client";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { db } from "@/src/lib/db";

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const messagesRepository = {
  findBySourceGroupAndExternalId(input: {
    source: string;
    groupExternalId: string;
    messageExternalId: string;
  }) {
    return db.inboundMessage.findFirst({
      where: {
        source: input.source,
        groupExternalId: input.groupExternalId,
        messageExternalId: input.messageExternalId,
      },
      include: {
        matchLog: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },
  findPotentialDuplicateByExternalId(input: {
    source: string;
    groupExternalId: string;
    messageExternalId: string;
  }) {
    return db.inboundMessage.findFirst({
      where: {
        source: input.source,
        groupExternalId: input.groupExternalId,
        messageExternalId: input.messageExternalId,
      },
      orderBy: { createdAt: "desc" },
    });
  },
  findPotentialDuplicateByFingerprint(input: { fingerprint: string; messageTime: Date }) {
    return db.inboundMessage.findFirst({
      where: {
        fingerprint: input.fingerprint,
        messageTime: {
          gte: new Date(input.messageTime.getTime() - IMPLEMENTATION_DEFAULTS.duplicateWindowMs),
          lte: new Date(input.messageTime.getTime() + IMPLEMENTATION_DEFAULTS.duplicateWindowMs),
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },
  createInboundMessage(data: {
    source: string;
    watcherId?: string;
    groupId?: string | null;
    groupExternalId: string;
    groupName?: string | null;
    messageExternalId?: string | null;
    senderExternalId?: string | null;
    senderName?: string | null;
    messageText: string;
    normalizedText: string;
    messageTime: Date;
    fingerprint: string;
    rawPayload?: Prisma.InputJsonValue;
  }) {
    return db.inboundMessage.create({
      data: {
        source: data.source,
        groupExternalId: data.groupExternalId,
        groupName: data.groupName ?? null,
        messageExternalId: data.messageExternalId ?? null,
        senderExternalId: data.senderExternalId ?? null,
        senderName: data.senderName ?? null,
        messageText: data.messageText,
        normalizedText: data.normalizedText,
        messageTime: data.messageTime,
        fingerprint: data.fingerprint,
        rawPayload: data.rawPayload,
        ...(data.watcherId ? { watcher: { connect: { id: data.watcherId } } } : {}),
        ...(data.groupId ? { group: { connect: { id: data.groupId } } } : {}),
      },
    });
  },
  createMatchLog(data: {
    inboundMessageId: string;
    decision: MatchDecision;
    matchedIncludeRules: Prisma.InputJsonValue;
    matchedExcludeRules: Prisma.InputJsonValue;
    reason: string;
  }) {
    return db.matchLog.create({ data });
  },
  async reserveMessageDedupe(data: {
    source: string;
    groupExternalId: string;
    messageExternalId?: string | null;
    fingerprint: string;
    messageTime: Date;
  }) {
    try {
      const dedupe = await db.messageDedupe.create({
        data: {
          source: data.source,
          groupExternalId: data.groupExternalId,
          messageExternalId: data.messageExternalId ?? null,
          fingerprint: data.fingerprint,
          messageTime: data.messageTime,
          expiresAt: new Date(Date.now() + IMPLEMENTATION_DEFAULTS.messageDedupeTtlMs),
        },
      });

      return {
        reserved: true,
        id: dedupe.id,
      };
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }

      return {
        reserved: false,
        id: null,
      };
    }
  },
  pruneExpiredMessageDedupes(now = new Date()) {
    return db.messageDedupe.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });
  },
};
