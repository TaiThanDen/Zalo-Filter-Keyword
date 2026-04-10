# AGENT START HERE

## 1. Nhiệm vụ
Triển khai một dự án **Next.js fullstack TypeScript trong một repo duy nhất** để vận hành hệ thống quản trị và xử lý cảnh báo cho message stream từ group chat.

Dự án phải có:
- web admin có login
- API backend nằm trong cùng project Next.js
- PostgreSQL + Prisma
- watcher runtime trong cùng repo
- worker runtime trong cùng repo
- rule engine include/exclude
- dedupe
- log
- Telegram notification ở phase 1

## 2. Các quyết định bắt buộc, không được tự ý đổi
1. Dự án dùng **một repo TypeScript**.
2. Web admin và backend API chạy trong **cùng một ứng dụng Next.js**.
3. Database dùng **PostgreSQL + Prisma**.
4. Auth dùng **credentials + session cookie HttpOnly**.
5. Watcher và worker là **tiến trình riêng**, nhưng source code vẫn nằm trong cùng repo.
6. Phase 1 chỉ bắt buộc **Telegram**.
7. Messenger là phase 2.
8. Rule engine phase 1 chỉ cần:
   - `contains`
   - `whole_word`
9. Không triển khai anti-detect hoặc bất kỳ logic né phát hiện nào.
10. Source integration phải đi qua **adapter abstraction**.
11. Agent **không được block toàn bộ project** chỉ vì chưa có source adapter thật; phải dùng `mock adapter` để hoàn thiện toàn bộ pipeline.

## 3. Mục tiêu phase 1
Agent phải bàn giao được một hệ thống có thể:
- admin login
- tạo group
- bật/tắt group
- tạo include/exclude rules
- gán rules cho groups
- ingest message event từ watcher/mock watcher
- match rule
- chống trùng
- lưu log
- enqueue notification job
- worker gửi Telegram
- web admin xem được log và trạng thái watcher

## 4. Phần không nằm trong phase 1
- Messenger delivery
- regex rules
- nhiều role phức tạp
- analytics nâng cao
- anti-detect
- concrete source-capture strategy

## 5. Thứ tự triển khai bắt buộc
1. Bootstrap project
2. Prisma schema + migrations
3. Auth
4. Admin UI shell
5. Groups CRUD
6. Rules CRUD + mapping
7. Ingest API
8. Rule engine
9. Dedupe
10. Logs
11. Notification jobs
12. Telegram worker
13. Watcher runtime + mock adapter
14. Watcher health UI
15. Tests
16. Deployment assets

## 6. Definition of Done
Phase 1 chỉ được coi là xong khi:
- dự án chạy local từ đầu đến cuối
- có seed admin user
- có mock watcher đẩy message mẫu
- có một flow đầy đủ từ message -> match -> notify -> log
- toàn bộ route nhạy cảm đã được bảo vệ auth
- có tài liệu setup và env
- có test cho rule engine, auth, ingest, worker

## 7. Cách ra quyết định khi gặp mơ hồ
Nếu tài liệu chưa đủ chi tiết, ưu tiên theo thứ tự:
1. tính đơn giản để ship MVP
2. khả năng vận hành ổn định trên VPS
3. dễ test
4. dễ thay thế source adapter
5. tối thiểu phụ thuộc bên ngoài

## 8. Điều tuyệt đối không làm
- không đổi sang monorepo nhiều app
- không tách backend thành framework khác
- không dùng thư viện auth khiến agent phụ thuộc quá mạnh vào magic behavior
- không hard-code rule trong code
- không để Prisma query rải trực tiếp trong UI components
- không bỏ qua idempotency/dedupe
- không triển khai phần né phát hiện

## 9. Đầu ra cần có trong codebase
- cấu trúc repo đúng spec
- migrations
- seed
- API handlers
- domain services
- admin pages
- worker script
- watcher script
- fixtures/mock data
- test
- README triển khai
