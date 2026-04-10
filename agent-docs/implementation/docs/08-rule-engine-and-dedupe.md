# 08. Rule Engine and Dedupe

## 1. Mục tiêu
Từ một inbound message, hệ thống phải quyết định:
- có match hay không
- match bởi include rules nào
- bị loại bởi exclude rules nào
- có cần tạo notification hay không

## 2. Normalize text
Phase 1 áp dụng các bước normalize sau:
1. Unicode normalize NFKC nếu có thể
2. trim đầu/cuối
3. collapse multiple spaces thành 1 space
4. lower-case nếu `caseSensitive = false`

Không bắt buộc trong phase 1:
- remove diacritics
- stemming
- fuzzy matching

## 3. Match types

### CONTAINS
- kiểm tra chuỗi pattern có xuất hiện trong normalized message hay không

### WHOLE_WORD
- kiểm tra pattern như một token độc lập
- phải xử lý boundary hợp lý để tránh match sai như:
  - `sup` không nên match `supper`
  - `pb` không nên match một chuỗi dài không tách token

## 4. Rule loading
Đối với mỗi inbound message:
- xác định group
- load rules active được gán cho group
- chia thành `includeRules` và `excludeRules`

## 5. Decision logic
Pseudo-code:

```ts
if (!group.isEnabled) {
  return REJECTED_GROUP_DISABLED
}

const includeHits = match(includeRules, normalizedText)
if (includeHits.length === 0) {
  return REJECTED_NO_INCLUDE
}

const excludeHits = match(excludeRules, normalizedText)
if (excludeHits.length > 0) {
  return REJECTED_BY_EXCLUDE
}

return MATCHED
```

## 6. Lưu kết quả
Mỗi inbound message phải có đúng một `MessageMatch`.

Fields cần lưu:
- decision
- matchedIncludeRules
- matchedExcludeRules
- reason

## 7. Dedupe
### Ưu tiên 1: messageExternalId
Nếu payload có `messageExternalId`, dùng nó làm tín hiệu dedupe mạnh.

### Ưu tiên 2: fingerprint
Nếu không có `messageExternalId`, tạo fingerprint theo công thức:

```text
sha256(
  source +
  "|" +
  groupExternalId +
  "|" +
  senderExternalId_or_senderName +
  "|" +
  normalizedText +
  "|" +
  minuteBucket(messageTime)
)
```

### Time window
- duplicate window mặc định: 5 phút

### Hành vi
- vẫn có thể lưu inbound message để audit
- nhưng nếu xác định duplicate thì:
  - `MessageMatch.decision = REJECTED_DUPLICATE`
  - không tạo notification job

## 8. Idempotency ở ingest API
API `POST /api/watcher/messages` phải an toàn khi watcher retry.

Nguyên tắc:
- request giống nhau không được tạo ra nhiều notification cho cùng một message
- service layer phải kiểm tra trước khi enqueue job

## 9. Edge cases phải cover
- groupExternalId chưa có trong DB
- messageText rỗng hoặc chỉ có whitespace
- watcher retry cùng payload nhiều lần
- include và exclude cùng match
- rule inactive nhưng vẫn còn mapping
- group disabled nhưng watcher vẫn gửi message

## 10. Quyết định cho phase 1
- nếu group chưa có trong DB, có thể:
  - từ chối ingest với lỗi domain, hoặc
  - chấp nhận lưu raw nhưng không match  
Khuyến nghị: **chấp nhận lưu raw nhưng đánh dấu reason là unknown_group** để dễ debug.
