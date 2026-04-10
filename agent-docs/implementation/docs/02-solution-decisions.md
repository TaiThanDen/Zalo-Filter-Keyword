# 02. Solution Decisions

## 1. Tổng quan quyết định kỹ thuật
Dự án được triển khai dưới dạng **một repo TypeScript duy nhất**, trong đó:
- **Next.js App Router** phục vụ cả web admin và HTTP API
- **Prisma + PostgreSQL** là lớp dữ liệu chính
- **Worker** là một script Node/TS chạy riêng để xử lý notification jobs
- **Watcher** là một script Node/TS chạy riêng để nhận dữ liệu từ source adapter và gửi về API
- **Zod** dùng để validate input/payload
- **Session auth tự quản lý** bằng credentials và HttpOnly cookie

## 2. Vì sao chọn Next.js fullstack
- Giữ FE và BE trong cùng repo đúng yêu cầu
- Giảm chi phí khởi tạo dự án
- Route Handlers phù hợp cho admin API và watcher ingest API
- Server Components thuận tiện cho dashboard nội bộ
- Dễ deploy trên VPS hoặc container

## 3. Vì sao không chọn nhiều app hoặc nhiều framework
- tăng độ phức tạp không cần thiết cho MVP
- tăng chi phí vận hành
- khó giao việc cho agent hơn
- không phù hợp yêu cầu “FE và BE chung một repo TS”

## 4. Quyết định auth
### Chọn
- email/password
- password hash bằng bcrypt
- session table trong DB
- cookie session HttpOnly, Secure ở production, SameSite=Lax

### Không chọn
- OAuth phức tạp
- social login
- nhiều role trong phase 1

### Lý do
- đơn giản
- dễ kiểm soát
- dễ test
- ít phụ thuộc hành vi thư viện ngoài

## 5. Quyết định queue/job
### Chọn
- `notification_jobs` table trong PostgreSQL làm outbox/job queue cho phase 1
- worker poll DB theo chu kỳ ngắn

### Không chọn ngay
- Redis/BullMQ ở phase 1

### Lý do
- giảm infra
- dễ triển khai trên VPS
- đủ tốt cho khối lượng MVP
- vẫn có thể nâng cấp sang Redis sau

## 6. Quyết định watcher
### Chọn
- watcher runtime trong cùng repo
- adapter abstraction
- mock adapter bắt buộc cho dev và test
- sync config từ API
- heartbeat định kỳ
- buffer cục bộ đơn giản cho retry

### Không chọn
- hard-code source reading logic vào web app
- làm watcher phụ thuộc trực tiếp DB

## 7. Quyết định rule engine
### Phase 1 chỉ bắt buộc
- `contains`
- `whole_word`

### Tạm chưa làm
- `regex`

### Lý do
- giảm complexity
- tránh ReDoS và edge cases không cần thiết
- vẫn đáp ứng nhu cầu keyword include/exclude của MVP

## 8. Quyết định notification
### Phase 1
- Telegram

### Phase 2
- Messenger

### Lý do
- Telegram triển khai nhanh và ít ma sát hơn
- giúp chứng minh pipeline trước

## 9. Quyết định observability
- structured logs cho API, worker, watcher
- watcher heartbeat
- notification job attempts + last error
- inbound message lưu raw payload tối thiểu

## 10. Quyết định về source integration
Core repo sẽ **không phụ thuộc vào cơ chế lấy message cụ thể**. Repo sẽ triển khai:
- watcher contract
- watcher config sync
- message ingest pipeline
- mock adapter
- test fixtures

Concrete source adapter phải là phần thay thế được, không làm ảnh hưởng core app.
