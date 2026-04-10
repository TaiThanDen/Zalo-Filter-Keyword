# 06. API Spec

## 1. Nguyên tắc API
- tất cả admin routes yêu cầu session hợp lệ
- watcher routes dùng `Authorization: Bearer <watcher_api_key>`
- request/response JSON
- validate bằng Zod
- trả lỗi rõ ràng, có `code`, `message`

## 2. Auth API

### POST /api/auth/login
Đăng nhập admin.

Request:
```json
{
  "email": "admin@example.com",
  "password": "secret"
}
```

Response 200:
```json
{
  "user": {
    "id": "usr_1",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

### POST /api/auth/logout
Logout phiên hiện tại.

### GET /api/auth/me
Trả user hiện tại nếu đang đăng nhập.

## 3. Groups API

### GET /api/groups
Query params:
- `enabled`
- `page`
- `pageSize`
- `search`

Response:
```json
{
  "items": [
    {
      "id": "grp_1",
      "source": "zalo",
      "externalId": "123456",
      "name": "Sales Group",
      "isEnabled": true,
      "watcherNodeId": "w_1"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

### POST /api/groups
Request:
```json
{
  "source": "zalo",
  "externalId": "123456",
  "name": "Sales Group",
  "isEnabled": true,
  "watcherNodeId": "w_1"
}
```

### PATCH /api/groups/:id
Cho phép sửa:
- name
- isEnabled
- watcherNodeId

### DELETE /api/groups/:id
Soft delete là tốt hơn, nhưng phase 1 có thể hard delete nếu chưa có ràng buộc vận hành. Khuyến nghị soft delete ở phase 1.1.

## 4. Rules API

### GET /api/rules
Query params:
- `type=INCLUDE|EXCLUDE`
- `active`
- `search`

### POST /api/rules
Request:
```json
{
  "type": "INCLUDE",
  "pattern": "PB",
  "matchType": "CONTAINS",
  "caseSensitive": false,
  "isActive": true,
  "note": "keyword quan trọng"
}
```

### PATCH /api/rules/:id
Cho phép sửa:
- pattern
- matchType
- caseSensitive
- isActive
- note

### DELETE /api/rules/:id

## 5. Group-Rule Mapping API

### GET /api/groups/:id/rules
Trả danh sách rules đã gán cho group.

### POST /api/groups/:id/rules
Request:
```json
{
  "ruleIds": ["rule_1", "rule_2", "rule_3"]
}
```
Hành vi:
- replace toàn bộ mapping cho group

## 6. Notification Channels API

### GET /api/channels
### POST /api/channels
Request Telegram mẫu:
```json
{
  "type": "TELEGRAM",
  "name": "Main Telegram Alert",
  "isActive": true,
  "config": {
    "botToken": "xxx",
    "chatId": "123456789"
  }
}
```

### PATCH /api/channels/:id
Cho phép sửa:
- name
- isActive
- config

## 7. Logs API

### GET /api/logs
Query params:
- `groupId`
- `decision`
- `from`
- `to`
- `page`
- `pageSize`
- `search`

Response item mẫu:
```json
{
  "messageId": "msg_1",
  "groupName": "Sales Group",
  "senderName": "Nguyen Van A",
  "messageText": "PB cần 2 bạn support mascot tối nay",
  "decision": "MATCHED",
  "matchedIncludeRules": ["PB", "sup", "mascot"],
  "matchedExcludeRules": [],
  "messageTime": "2026-04-08T10:15:22.000Z",
  "notificationStatus": "SENT"
}
```

### GET /api/logs/:id
Trả chi tiết raw payload, fingerprint, job statuses.

## 8. Watcher API

### GET /api/watcher/config
Auth: Bearer watcher API key

Response:
```json
{
  "watcher": {
    "id": "w_1",
    "name": "watcher-main"
  },
  "groups": [
    {
      "id": "grp_1",
      "source": "zalo",
      "externalId": "123456",
      "name": "Sales Group",
      "isEnabled": true
    }
  ],
  "rules": [
    {
      "id": "rule_1",
      "type": "INCLUDE",
      "pattern": "PB",
      "matchType": "CONTAINS",
      "caseSensitive": false
    }
  ],
  "channels": [
    {
      "id": "ch_1",
      "type": "TELEGRAM",
      "isActive": true
    }
  ]
}
```

### POST /api/watcher/heartbeat
Request:
```json
{
  "version": "0.1.0",
  "status": "online"
}
```

### POST /api/watcher/messages
Request:
```json
{
  "source": "zalo",
  "groupExternalId": "123456",
  "groupName": "Sales Group",
  "messageExternalId": "msg_abc",
  "senderExternalId": "u_111",
  "senderName": "Nguyen Van A",
  "messageText": "PB cần 2 bạn support mascot tối nay",
  "messageTime": "2026-04-08T10:15:22.000Z",
  "rawPayload": {
    "example": true
  }
}
```

Response:
```json
{
  "accepted": true,
  "inboundMessageId": "im_1",
  "decision": "MATCHED",
  "notificationJobsCreated": 1
}
```

## 9. Health API

### GET /api/health
Trả trạng thái cơ bản:
- app up
- db connectivity
- timestamp
