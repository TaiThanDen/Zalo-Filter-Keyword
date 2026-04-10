# 09. Notification Spec

## 1. Mục tiêu
Khi một message được quyết định là `MATCHED`, hệ thống phải tạo job gửi thông báo ra channel đang active.

## 2. Phase 1
- chỉ bắt buộc Telegram

## 3. Telegram channel config
`NotificationChannel.config` cho Telegram tối thiểu gồm:
```json
{
  "botToken": "string",
  "chatId": "string"
}
```

Tùy chọn:
```json
{
  "parseMode": "HTML"
}
```

## 4. Template thông báo
Template mặc định:

```text
[ZALO ALERT]

Group: {groupName}
Sender: {senderName}
Time: {messageTime}

Message:
{messageText}

Matched:
{matchedKeywords}
```

Quy tắc:
- cắt ngắn message quá dài
- escape ký tự đặc biệt nếu dùng parse mode
- matchedKeywords là danh sách unique

## 5. Job creation
Khi `MessageMatch.decision = MATCHED`:
- load tất cả `NotificationChannel` đang active
- với mỗi channel active, tạo một `NotificationJob`

## 6. Worker logic
### Query điều kiện lấy job
- `status = PENDING`
- hoặc `status = RETRY_SCHEDULED` và `nextRetryAt <= now()`

### Worker state transitions
- `PENDING -> PROCESSING`
- `PROCESSING -> SENT`
- `PROCESSING -> FAILED`
- `PROCESSING -> RETRY_SCHEDULED`

## 7. Retry policy
Khuyến nghị cho phase 1:
- attempt 1: ngay lập tức
- attempt 2: sau 1 phút
- attempt 3: sau 5 phút
- attempt 4: sau 15 phút
- quá max attempts thì `FAILED`

## 8. Job payload
`payload` có thể chứa snapshot tối thiểu để worker không phải join quá nhiều:
```json
{
  "groupName": "Sales Group",
  "senderName": "Nguyen Van A",
  "messageText": "PB cần 2 bạn support mascot tối nay",
  "messageTime": "2026-04-08T10:15:22.000Z",
  "matchedKeywords": ["PB", "sup", "mascot"]
}
```

## 9. Telegram provider contract
Worker nên dùng một service có interface:

```ts
interface NotificationProvider {
  send(payload: NotificationPayload, config: unknown): Promise<SendResult>
}
```

Telegram là một implementation của interface này.

## 10. Phase 2
Messenger được thêm bằng cách:
- mở rộng `ChannelType`
- thêm provider mới
- giữ nguyên job model
