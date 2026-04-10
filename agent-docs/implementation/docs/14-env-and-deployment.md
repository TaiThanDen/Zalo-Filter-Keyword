# 14. Env and Deployment

## 1. Mục tiêu
Cho phép agent triển khai local trước, sau đó deploy lên VPS với ít thành phần nhất có thể.

## 2. Processes
### Bắt buộc
- `next` app
- `worker`

### Tùy môi trường
- `watcher`

## 3. Environment variables

```env
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/zalo_alert
SESSION_COOKIE_NAME=zalo_alert_session
SESSION_SECRET=change_me
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=change_me

WATCHER_API_BASE_URL=http://localhost:3000
WATCHER_API_KEY=change_me
WATCHER_NODE_NAME=watcher-main
WATCHER_VERSION=0.1.0
WATCHER_HEARTBEAT_INTERVAL_MS=30000
WATCHER_CONFIG_SYNC_INTERVAL_MS=60000

WORKER_POLL_INTERVAL_MS=5000
NOTIFICATION_MAX_ATTEMPTS=4
```

Telegram channel config được lưu ở DB, không cần env riêng cho production app.

## 4. Local development flow
1. chạy PostgreSQL
2. cài dependencies
3. `prisma migrate dev`
4. `prisma db seed`
5. `npm run dev`
6. `npm run worker`
7. `npm run watcher:mock`

## 5. Production deployment model
Khuyến nghị:
- 1 VPS
- 1 PostgreSQL instance
- 1 process Next.js
- 1 process worker
- watcher có thể cùng hoặc khác machine tùy môi trường

## 6. Process manager
Dùng một trong các cách:
- systemd
- pm2
- Docker Compose

## 7. Docker Compose gợi ý
Services:
- app
- worker
- postgres

Watcher có thể là service riêng nếu muốn.

## 8. Migrations
Production start-up phải có bước:
- apply migrations
- bootstrap admin nếu chưa có

## 9. Secrets
- không commit `.env`
- commit `templates/env.example`
- session secret phải đủ mạnh
- watcher API key không lưu plain text trong DB; chỉ lưu hash

## 10. Backup
Khuyến nghị tối thiểu:
- backup PostgreSQL hàng ngày
- giữ 7 ngày
- test restore định kỳ
