# Zalo Alert Admin - Agent Documentation Pack

Bộ tài liệu này dùng để giao việc cho coding agent triển khai dự án **Next.js fullstack TypeScript trong một repo duy nhất**.

## Mục tiêu hệ thống
Xây dựng một hệ thống quản trị và xử lý cảnh báo cho luồng tin nhắn từ group Zalo, với các chức năng chính:

- website quản trị có đăng nhập
- quản lý include keywords
- quản lý exclude keywords
- bật/tắt group theo dõi
- lưu log tin nhắn và log match
- gửi cảnh báo qua Telegram trong phase 1
- mở rộng Messenger trong phase 2
- watcher chạy như một tiến trình riêng nhưng vẫn nằm trong cùng repo TypeScript

## Phạm vi của bộ tài liệu này
Bộ tài liệu này giúp agent triển khai:

- web admin
- API backend
- database schema
- worker gửi thông báo
- watcher runtime + mock adapter
- rule engine
- dedupe
- logging
- deployment cơ bản trên VPS

**Lưu ý quan trọng:** bộ tài liệu không mô tả kỹ thuật né phát hiện, anti-detect, hoặc bất kỳ cách bypass kiểm soát nền tảng nào. Phần “source adapter” phải được thiết kế dạng abstraction để có thể thay thế sau này.

## Thứ tự đọc khuyến nghị cho agent
1. `AGENT_START_HERE.md`
2. `docs/01-product-requirements.md`
3. `docs/02-solution-decisions.md`
4. `docs/03-system-architecture.md`
5. `docs/04-repository-structure.md`
6. `docs/05-database-schema.md`
7. `docs/06-api-spec.md`
8. `docs/07-admin-web-spec.md`
9. `docs/08-rule-engine-and-dedupe.md`
10. `docs/09-notification-spec.md`
11. `docs/10-watcher-spec.md`
12. `docs/11-implementation-plan.md`
13. `docs/12-test-plan.md`
14. `docs/13-acceptance-criteria.md`
15. `docs/14-env-and-deployment.md`
16. `docs/15-agent-workflow.md`

## Kết quả kỳ vọng
Sau khi đọc hết bộ tài liệu, agent phải có thể:

- scaffold được dự án
- triển khai đúng kiến trúc đã chốt
- biết thứ tự làm việc
- biết tiêu chí nghiệm thu
- không phải tự suy diễn các quyết định nền tảng

## Tài liệu trong gói này
- `AGENT_START_HERE.md`
- `docs/01-product-requirements.md`
- `docs/02-solution-decisions.md`
- `docs/03-system-architecture.md`
- `docs/04-repository-structure.md`
- `docs/05-database-schema.md`
- `docs/06-api-spec.md`
- `docs/07-admin-web-spec.md`
- `docs/08-rule-engine-and-dedupe.md`
- `docs/09-notification-spec.md`
- `docs/10-watcher-spec.md`
- `docs/11-implementation-plan.md`
- `docs/12-test-plan.md`
- `docs/13-acceptance-criteria.md`
- `docs/14-env-and-deployment.md`
- `docs/15-agent-workflow.md`
- `templates/env.example`

## Stack đã chốt
- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma ORM
- Session-based auth bằng credentials
- Route Handlers cho API
- Worker chạy riêng nhưng trong cùng repo
- Watcher chạy riêng nhưng trong cùng repo
- Telegram trước, Messenger sau
