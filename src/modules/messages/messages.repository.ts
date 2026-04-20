import { Prisma, MatchDecision } from "@prisma/client";
import { IMPLEMENTATION_DEFAULTS } from "@/src/config/constants";
import { db } from "@/src/lib/db";

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
};
