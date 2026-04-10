# 04. Repository Structure

## 1. Mục tiêu
Giữ toàn bộ hệ thống trong **một repo Next.js TypeScript**, nhưng vẫn tách lớp đủ rõ để agent dễ triển khai và bảo trì.

## 2. Cấu trúc thư mục đề xuất

```text
/
├─ app/
│  ├─ (auth)/
│  │  └─ login/
│  │     └─ page.tsx
│  ├─ (dashboard)/
│  │  ├─ dashboard/
│  │  │  └─ page.tsx
│  │  ├─ groups/
│  │  │  └─ page.tsx
│  │  ├─ rules/
│  │  │  └─ page.tsx
│  │  ├─ channels/
│  │  │  └─ page.tsx
│  │  ├─ logs/
│  │  │  └─ page.tsx
│  │  └─ watchers/
│  │     └─ page.tsx
│  └─ api/
│     ├─ auth/
│     │  ├─ login/route.ts
│     │  ├─ logout/route.ts
│     │  └─ me/route.ts
│     ├─ groups/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     ├─ rules/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     ├─ groups/[id]/rules/route.ts
│     ├─ channels/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     ├─ logs/
│     │  ├─ route.ts
│     │  └─ [id]/route.ts
│     ├─ watcher/
│     │  ├─ config/route.ts
│     │  ├─ heartbeat/route.ts
│     │  └─ messages/route.ts
│     └─ health/route.ts
├─ src/
│  ├─ config/
│  │  ├─ env.ts
│  │  └─ constants.ts
│  ├─ lib/
│  │  ├─ db.ts
│  │  ├─ cookies.ts
│  │  ├─ crypto.ts
│  │  ├─ logger.ts
│  │  ├─ time.ts
│  │  └─ pagination.ts
│  ├─ types/
│  │  ├─ api.ts
│  │  ├─ auth.ts
│  │  ├─ message.ts
│  │  └─ rules.ts
│  ├─ modules/
│  │  ├─ auth/
│  │  │  ├─ auth.service.ts
│  │  │  ├─ auth.repository.ts
│  │  │  ├─ auth.schemas.ts
│  │  │  └─ auth.types.ts
│  │  ├─ groups/
│  │  ├─ rules/
│  │  ├─ messages/
│  │  ├─ matching/
│  │  ├─ notifications/
│  │  ├─ watchers/
│  │  └─ logs/
│  ├─ components/
│  │  ├─ ui/
│  │  ├─ layout/
│  │  ├─ forms/
│  │  └─ data-table/
│  └─ server/
│     ├─ guards/
│     ├─ middleware/
│     └─ session/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ scripts/
│  ├─ worker.ts
│  ├─ watcher.ts
│  └─ bootstrap-admin.ts
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ fixtures/
│  ├─ sample-messages.json
│  └─ mock-config.json
├─ docs/
├─ templates/
├─ package.json
├─ tsconfig.json
├─ next.config.ts
└─ .env
```

## 3. Nguyên tắc tổ chức code
### Route Handlers
- chỉ parse request
- gọi service layer
- map response
- không nhét business logic dài trong `route.ts`

### Modules
Mỗi module nên có:
- `*.service.ts`
- `*.repository.ts`
- `*.schemas.ts`
- `*.types.ts`

### UI
- server component mặc định
- client component chỉ dùng khi cần form state hoặc tương tác động
- component UI dùng lại được tách ở `src/components`

### Scripts
- `worker.ts`: xử lý notification jobs
- `watcher.ts`: runtime watcher + adapter bootstrap
- `bootstrap-admin.ts`: seed admin tiện cho môi trường mới

## 4. Quy tắc import
- UI không import repository trực tiếp
- repository không import component UI
- watcher/worker chỉ dùng domain modules, config, lib
- không tạo vòng lặp giữa modules

## 5. Quy tắc naming
- file names: `kebab-case` hoặc `dot-suffix`
- types/interfaces: `PascalCase`
- functions/variables: `camelCase`
- database model: `PascalCase`
- db fields: `camelCase` trong Prisma, snake_case nếu raw SQL cần rõ ràng

## 6. Quy tắc config
- mọi env đọc qua `src/config/env.ts`
- không đọc `process.env` rải rác
- validate env khi boot app
