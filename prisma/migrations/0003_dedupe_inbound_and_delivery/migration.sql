CREATE UNIQUE INDEX "InboundMessage_source_groupExternalId_messageExternalId_key"
ON "InboundMessage"("source", "groupExternalId", "messageExternalId");

CREATE UNIQUE INDEX "NotificationDelivery_matchLogId_notificationChannelId_key"
ON "NotificationDelivery"("matchLogId", "notificationChannelId");
