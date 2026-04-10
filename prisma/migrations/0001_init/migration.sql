CREATE TYPE "UserRole" AS ENUM ('ADMIN');
CREATE TYPE "RuleType" AS ENUM ('INCLUDE', 'EXCLUDE');
CREATE TYPE "MatchType" AS ENUM ('CONTAINS', 'WHOLE_WORD');
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM', 'MESSENGER');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRY_SCHEDULED');
CREATE TYPE "MatchDecision" AS ENUM ('MATCHED', 'REJECTED_NO_INCLUDE', 'REJECTED_BY_EXCLUDE', 'REJECTED_GROUP_DISABLED', 'REJECTED_DUPLICATE', 'REJECTED_UNKNOWN_GROUP');
CREATE TYPE "WatcherReportedStatus" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Watcher" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKeyHash" TEXT NOT NULL,
  "reportedStatus" "WatcherReportedStatus" NOT NULL DEFAULT 'OFFLINE',
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastSeenIp" TEXT,
  "lastVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Watcher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Group" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'zalo',
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "watcherId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rule" (
  "id" TEXT NOT NULL,
  "type" "RuleType" NOT NULL,
  "pattern" TEXT NOT NULL,
  "matchType" "MatchType" NOT NULL DEFAULT 'CONTAINS',
  "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupRule" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundMessage" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'zalo',
  "watcherId" TEXT,
  "groupId" TEXT,
  "groupExternalId" TEXT NOT NULL,
  "groupName" TEXT,
  "messageExternalId" TEXT,
  "senderExternalId" TEXT,
  "senderName" TEXT,
  "messageText" TEXT NOT NULL,
  "normalizedText" TEXT NOT NULL,
  "messageTime" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchLog" (
  "id" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "decision" "MatchDecision" NOT NULL,
  "matchedIncludeRules" JSONB,
  "matchedExcludeRules" JSONB,
  "reason" TEXT,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationChannel" (
  "id" TEXT NOT NULL,
  "type" "ChannelType" NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "matchLogId" TEXT NOT NULL,
  "notificationChannelId" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "Watcher_apiKeyHash_key" ON "Watcher"("apiKeyHash");
CREATE UNIQUE INDEX "Group_source_externalId_key" ON "Group"("source", "externalId");
CREATE INDEX "Group_isEnabled_idx" ON "Group"("isEnabled");
CREATE INDEX "Rule_type_isActive_idx" ON "Rule"("type", "isActive");
CREATE UNIQUE INDEX "GroupRule_groupId_ruleId_key" ON "GroupRule"("groupId", "ruleId");
CREATE INDEX "InboundMessage_groupExternalId_messageTime_idx" ON "InboundMessage"("groupExternalId", "messageTime");
CREATE INDEX "InboundMessage_fingerprint_idx" ON "InboundMessage"("fingerprint");
CREATE INDEX "InboundMessage_messageExternalId_idx" ON "InboundMessage"("messageExternalId");
CREATE UNIQUE INDEX "MatchLog_inboundMessageId_key" ON "MatchLog"("inboundMessageId");
CREATE INDEX "MatchLog_decision_processedAt_idx" ON "MatchLog"("decision", "processedAt");
CREATE INDEX "NotificationDelivery_status_nextRetryAt_idx" ON "NotificationDelivery"("status", "nextRetryAt");
CREATE INDEX "NotificationDelivery_notificationChannelId_status_idx" ON "NotificationDelivery"("notificationChannelId", "status");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "Watcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupRule" ADD CONSTRAINT "GroupRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRule" ADD CONSTRAINT "GroupRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "Watcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchLog" ADD CONSTRAINT "MatchLog_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "InboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_matchLogId_fkey" FOREIGN KEY ("matchLogId") REFERENCES "MatchLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationChannelId_fkey" FOREIGN KEY ("notificationChannelId") REFERENCES "NotificationChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
