# 03. System Architecture

## 1. Thành phần hệ thống

```text
[ Admin Browser ]
       |
       v
[ Next.js App ]
  - Admin UI
  - Route Handlers API
  - Domain Services
       |
       v
[ PostgreSQL ]
  - users
  - sessions
  - groups
  - rules
  - inbound_messages
  - matches
  - notification_jobs
  - watcher_nodes

[ Worker Process ]
  - polls notification_jobs
  - sends Telegram
  - updates job status

[ Watcher Process ]
  - syncs config
  - sends heartbeat
  - receives source events from adapter
  - posts messages to Next.js API

[ Source Adapter ]
  - mock adapter in phase 1
  - real adapter pluggable later
```

## 2. Trách nhiệm từng thành phần

### 2.1 Next.js App
- render admin UI
- expose auth routes
- expose admin CRUD routes
- expose watcher ingest routes
- chạy business logic thông qua domain modules

### 2.2 PostgreSQL
- nguồn dữ liệu chuẩn
- lưu session
- lưu inbound messages
- lưu kết quả match
- lưu notification jobs
- lưu watcher health

### 2.3 Worker
- lấy các job `pending` hoặc `retryable`
- render nội dung thông báo
- gửi Telegram
- cập nhật `sent`, `failed`, `retry_scheduled`

### 2.4 Watcher
- lấy config từ API
- gửi heartbeat
- nhận event từ source adapter
- chuẩn hóa payload tối thiểu
- post event lên ingest API
- retry khi API lỗi

### 2.5 Source Adapter
- abstraction layer để đưa event thô vào watcher
- mock adapter là bắt buộc cho phase 1
- real adapter là phần thay thế sau

## 3. Luồng nghiệp vụ chính

### 3.1 Cấu hình hệ thống
1. Admin login
2. Admin tạo groups
3. Admin tạo rules include/exclude
4. Admin gán rules cho groups
5. Admin cấu hình Telegram channel

### 3.2 Ingest message
1. Watcher nhận message event từ source adapter
2. Watcher tạo payload chuẩn
3. Watcher gọi `POST /api/watcher/messages`
4. API validate payload
5. API dedupe
6. API lưu inbound message
7. API chạy rule engine
8. API lưu match result
9. API tạo notification job nếu matched

### 3.3 Gửi thông báo
1. Worker query `notification_jobs`
2. Worker build message theo template
3. Worker gửi Telegram
4. Worker cập nhật trạng thái job

### 3.4 Theo dõi watcher
1. Watcher gửi `POST /api/watcher/heartbeat`
2. API cập nhật last heartbeat
3. Admin UI đọc trạng thái watcher
4. Nếu heartbeat quá hạn thì đánh dấu offline/degraded

## 4. Boundary và nguyên tắc kiến trúc
- UI không gọi Prisma trực tiếp.
- Route Handlers chỉ orchestrate request/response.
- Business rules nằm ở `src/modules`.
- Data access nằm ở repository layer.
- Worker và watcher không được import UI code.
- Watcher không được ghi DB trực tiếp; chỉ đi qua API.

## 5. Các failure mode cần tính trước
### API unavailable
- watcher giữ buffer cục bộ và retry

### Telegram lỗi tạm thời
- worker tăng attempts
- set `next_retry_at`

### Duplicate messages
- dedupe theo `message_external_id`
- fallback sang fingerprint

### Watcher chết
- admin nhìn thấy `last_heartbeat_at`
- trạng thái watcher chuyển offline sau TTL

## 6. Nguyên tắc ưu tiên
1. idempotent
2. dễ test
3. ít phụ thuộc môi trường
4. dễ thay source adapter
5. có log để debug
