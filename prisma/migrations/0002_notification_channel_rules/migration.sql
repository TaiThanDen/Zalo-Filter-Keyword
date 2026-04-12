CREATE TABLE "NotificationChannelRule" (
  "id" TEXT NOT NULL,
  "notificationChannelId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationChannelRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationChannelRule_notificationChannelId_ruleId_key"
ON "NotificationChannelRule"("notificationChannelId", "ruleId");

CREATE INDEX "NotificationChannelRule_ruleId_idx"
ON "NotificationChannelRule"("ruleId");

ALTER TABLE "NotificationChannelRule"
ADD CONSTRAINT "NotificationChannelRule_notificationChannelId_fkey"
FOREIGN KEY ("notificationChannelId") REFERENCES "NotificationChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationChannelRule"
ADD CONSTRAINT "NotificationChannelRule_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "Rule"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
