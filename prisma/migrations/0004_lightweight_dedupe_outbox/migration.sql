CREATE TABLE "MessageDedupe" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'zalo',
  "groupExternalId" TEXT NOT NULL,
  "messageExternalId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "messageTime" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDedupe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "notificationChannelId" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageDedupe_fingerprint_key" ON "MessageDedupe"("fingerprint");
CREATE UNIQUE INDEX "MessageDedupe_source_groupExternalId_messageExternalId_key"
ON "MessageDedupe"("source", "groupExternalId", "messageExternalId");
CREATE INDEX "MessageDedupe_source_groupExternalId_messageTime_idx"
ON "MessageDedupe"("source", "groupExternalId", "messageTime");
CREATE INDEX "MessageDedupe_expiresAt_idx" ON "MessageDedupe"("expiresAt");

CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_status_nextRetryAt_idx" ON "NotificationOutbox"("status", "nextRetryAt");
CREATE INDEX "NotificationOutbox_notificationChannelId_status_idx"
ON "NotificationOutbox"("notificationChannelId", "status");
CREATE INDEX "NotificationOutbox_expiresAt_idx" ON "NotificationOutbox"("expiresAt");

ALTER TABLE "NotificationOutbox"
ADD CONSTRAINT "NotificationOutbox_notificationChannelId_fkey"
FOREIGN KEY ("notificationChannelId") REFERENCES "NotificationChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
