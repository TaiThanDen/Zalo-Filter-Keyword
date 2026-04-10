# 03. Target State

## Mục tiêu kỹ thuật mong muốn sau khi setup

### A. Repo và app
- Một repo Next.js fullstack TypeScript chạy được trên VPS.
- Có admin web và API.
- Có auth admin.
- Có pages:
  - dashboard
  - groups
  - rules
  - channels
  - logs
  - watchers

### B. Data và xử lý
- Có database schema đầy đủ.
- Có ingest API cho watcher.
- Có normalize + dedupe + rule engine.
- Có `match_log`.
- Có `notification_delivery`.
- Có delivery status.

### C. Notification
- Telegram chạy trước.
- Messenger chỉ để extension point sau.

### D. Watcher
- Có watcher simulator chạy end-to-end.
- Có watcher runtime thật hoặc ít nhất scaffold thật sự sẵn sàng.
- Có heartbeat.
- Có config fetch.
- Có log tối thiểu.

### E. Vận hành
- Có `.env.example`
- Có migration/seed
- Có lệnh chạy app
- Có lệnh chạy worker
- Có lệnh chạy watcher
- Có systemd/pm2 hoặc cách chạy nền rõ ràng nếu agent thấy phù hợp
- Có runbook ngắn cho restart, log, health check

## Definition of done tối thiểu

1. Admin login được.
2. Tạo group được.
3. Tạo include/exclude rule được.
4. Tạo Telegram channel được.
5. Watcher simulator gửi message được.
6. Ingest -> match -> delivery flow chạy end-to-end.
7. Logs xem được trên UI.
8. Watcher heartbeat hiển thị được.
9. Nếu agent chạm tới watcher thật, phải chứng minh không làm mất session hiện có.
