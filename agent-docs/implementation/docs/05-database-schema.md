# 05. Database Schema

## 1. Nguyên tắc thiết kế
- schema tối giản nhưng đủ cho MVP
- ưu tiên auditability
- hỗ trợ idempotent ingest
- tách rõ inbound message, match result, notification jobs
- hỗ trợ watcher heartbeat và config sync

## 2. Danh sách entity

### User
Tài khoản admin.

### Session
Phiên đăng nhập của admin.

### WatcherNode
Thông tin watcher đang hoạt động.

### SourceGroup
Group theo dõi từ nguồn dữ liệu.

### Rule
Keyword include/exclude.

### GroupRule
Bảng nối giữa group và rule.

### InboundMessage
Message được ingest từ watcher.

### MessageMatch
Kết quả evaluate của một inbound message.

### NotificationChannel
Cấu hình kênh gửi thông báo.

### NotificationJob
Outbox/job queue cho phase 1.

## 3. Prisma model outline

```prisma
enum UserRole {
  ADMIN
}

enum RuleType {
  INCLUDE
  EXCLUDE
}

enum MatchType {
  CONTAINS
  WHOLE_WORD
}

enum ChannelType {
  TELEGRAM
  MESSENGER
}

enum JobStatus {
  PENDING
  PROCESSING
  SENT
  FAILED
  RETRY_SCHEDULED
}

enum MatchDecision {
  MATCHED
  REJECTED_NO_INCLUDE
  REJECTED_BY_EXCLUDE
  REJECTED_GROUP_DISABLED
  REJECTED_DUPLICATE
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  role          UserRole  @default(ADMIN)
  isActive      Boolean   @default(true)
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  tokenHash    String   @unique
  expiresAt    DateTime
  lastSeenAt   DateTime?
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model WatcherNode {
  id               String    @id @default(cuid())
  name             String
  apiKeyHash       String    @unique
  status           String    @default("offline")
  lastHeartbeatAt  DateTime?
  lastSeenIp       String?
  lastVersion      String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  groups           SourceGroup[]
  messages         InboundMessage[]
}

model SourceGroup {
  id             String      @id @default(cuid())
  source         String      @default("zalo")
  externalId     String
  name           String
  isEnabled      Boolean     @default(true)
  watcherNodeId  String?
  watcherNode    WatcherNode? @relation(fields: [watcherNodeId], references: [id], onDelete: SetNull)
  rules          GroupRule[]
  messages       InboundMessage[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@unique([source, externalId])
  @@index([isEnabled])
}

model Rule {
  id              String      @id @default(cuid())
  type            RuleType
  pattern         String
  matchType       MatchType   @default(CONTAINS)
  caseSensitive   Boolean     @default(false)
  isActive        Boolean     @default(true)
  note            String?
  groups          GroupRule[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  @@index([type, isActive])
}

model GroupRule {
  id         String      @id @default(cuid())
  groupId     String
  ruleId      String
  group       SourceGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  rule        Rule        @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  createdAt   DateTime    @default(now())
  @@unique([groupId, ruleId])
}

model InboundMessage {
  id                 String       @id @default(cuid())
  source             String       @default("zalo")
  watcherNodeId      String?
  watcherNode        WatcherNode? @relation(fields: [watcherNodeId], references: [id], onDelete: SetNull)
  groupId            String?
  group              SourceGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  groupExternalId    String
  messageExternalId  String?
  senderExternalId   String?
  senderName         String?
  messageText        String
  normalizedText     String
  messageTime        DateTime
  fingerprint        String
  rawPayload         Json?
  createdAt          DateTime     @default(now())
  match              MessageMatch?
  @@index([groupExternalId, messageTime])
  @@index([fingerprint])
  @@index([messageExternalId])
}

model MessageMatch {
  id                    String        @id @default(cuid())
  inboundMessageId      String        @unique
  decision              MatchDecision
  matchedIncludeRules   Json?
  matchedExcludeRules   Json?
  reason                String?
  processedAt           DateTime      @default(now())
  inboundMessage        InboundMessage @relation(fields: [inboundMessageId], references: [id], onDelete: Cascade)
  notificationJobs      NotificationJob[]
  @@index([decision, processedAt])
}

model NotificationChannel {
  id            String      @id @default(cuid())
  type          ChannelType
  name          String
  isActive      Boolean     @default(true)
  config        Json
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  jobs          NotificationJob[]
}

model NotificationJob {
  id                   String              @id @default(cuid())
  matchId              String
  channelId            String
  status               JobStatus           @default(PENDING)
  attempts             Int                 @default(0)
  nextRetryAt          DateTime?
  sentAt               DateTime?
  lastError            String?
  payload              Json?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  match                MessageMatch        @relation(fields: [matchId], references: [id], onDelete: Cascade)
  channel              NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  @@index([status, nextRetryAt])
  @@index([channelId, status])
}
```

## 4. Ràng buộc dữ liệu quan trọng
- `User.email` phải unique.
- `Session.tokenHash` phải unique.
- `WatcherNode.apiKeyHash` phải unique.
- `SourceGroup(source, externalId)` phải unique.
- `GroupRule(groupId, ruleId)` phải unique.
- `MessageMatch.inboundMessageId` unique 1-1.
- `InboundMessage.fingerprint` phải được index để dedupe nhanh.

## 5. Dedupe strategy ở DB layer
### Ưu tiên 1
Nếu có `messageExternalId`, vẫn lưu message nhưng trước khi notify phải kiểm tra duplicate logic.

### Ưu tiên 2
Dùng `fingerprint` + time window ở service layer.

## 6. Seed data tối thiểu
- 1 admin user
- 1 watcher node
- 3 include rules: PB, sup, mascot
- 2 exclude rules mẫu
- 1 Telegram channel disabled by default
