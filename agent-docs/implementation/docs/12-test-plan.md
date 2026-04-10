# 12. Test Plan

## 1. Mục tiêu
Bảo đảm phase 1 hoạt động đúng theo pipeline và có thể refactor sau này mà không vỡ core logic.

## 2. Unit tests

### 2.1 Normalize
- trim đúng
- collapse spaces đúng
- lower-case đúng khi case-insensitive
- giữ nguyên khi case-sensitive

### 2.2 Contains matcher
- match khi pattern xuất hiện
- không match khi không có pattern

### 2.3 Whole-word matcher
- match khi pattern là token độc lập
- không match khi pattern chỉ là một phần của token lớn hơn

### 2.4 Dedupe
- nhận diện duplicate theo messageExternalId
- fallback fingerprint hoạt động đúng
- duplicate window hoạt động đúng

### 2.5 Decision engine
- group disabled -> reject
- no include -> reject
- include hit + no exclude -> matched
- include hit + exclude hit -> reject

## 3. Integration tests

### 3.1 Auth
- login thành công
- login sai password
- route bảo vệ không có session bị chặn

### 3.2 Groups/Rules
- tạo group
- tạo rule
- gán rule cho group
- query lại thấy mapping đúng

### 3.3 Ingest
- watcher gửi message hợp lệ
- API lưu inbound message
- API tạo MessageMatch
- API không tạo job khi reject
- API tạo job khi matched

### 3.4 Worker
- lấy được pending job
- gửi provider mock thành công
- update trạng thái job sent
- retry khi provider mock fail

### 3.5 Watcher config/heartbeat
- heartbeat cập nhật WatcherNode
- config trả đúng groups/rules active

## 4. End-to-end test tối thiểu
Luồng cần cover:
1. admin login
2. tạo group
3. tạo include/exclude rules
4. gán rule cho group
5. cấu hình Telegram channel mock
6. mock watcher gửi message
7. logs hiển thị decision
8. worker gửi job thành công

## 5. Test doubles
- Telegram provider mock
- mock source adapter
- fixture messages

## 6. Data fixtures gợi ý
### Message match
`"PB cần 2 bạn support mascot tối nay"`

### Message reject no include
`"họp team lúc 8h"`

### Message reject by exclude
`"supplies list đã cập nhật"`

## 7. Coverage ưu tiên
Không bắt buộc coverage cứng 100%, nhưng bắt buộc có test cho:
- auth
- matcher
- dedupe
- ingest flow
- worker flow
