# Zalo Alert Admin

Next.js fullstack admin + API for monitored message alerts, with PostgreSQL/Prisma, DB-backed `notification_delivery` queue, a separate worker runtime, and a watcher runtime with a built-in simulator.

## What is included

- Admin login with credentials + DB-backed session cookie
- Groups CRUD
- Rules CRUD
- Group-rule mapping
- Telegram notification_channel CRUD
- Watcher config + heartbeat + ingest APIs
- Rule engine with `CONTAINS` and `WHOLE_WORD`
- Dedupe with strong external-id key and fingerprint fallback
- Match logs with reason and normalized text
- DB-backed `notification_delivery` outbox/queue
- Worker runtime for Telegram delivery
- Watcher simulator using fixture payloads
- Logs UI and watcher status UI

## Local setup

1. Copy `.env.example` to `.env` and adjust values.
2. Start PostgreSQL or point `DATABASE_URL` and `DIRECT_URL` to Supabase.
3. Install dependencies with `npm install`.
4. Generate Prisma client: `npm run db:generate`
5. Apply schema: `npm run db:migrate`
6. Seed baseline data: `npm run db:seed`
7. Start the app: `npm run dev`
8. Start the worker: `npm run worker`
9. Start the watcher simulator: `npm run watcher:mock`

## Default admin credentials

- Email: value from `ADMIN_SEED_EMAIL`
- Password: value from `ADMIN_SEED_PASSWORD`

## Useful commands

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run bootstrap-admin`
- `npm run worker`
- `npm run watcher:mock`

## API highlights

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET|POST /api/groups`
- `PATCH|DELETE /api/groups/:id`
- `GET|POST /api/rules`
- `PATCH|DELETE /api/rules/:id`
- `GET|POST /api/groups/:id/rules`
- `GET|POST /api/channels`
- `PATCH /api/channels/:id`
- `GET /api/logs`
- `GET /api/logs/:id`
- `GET /api/watcher/config`
- `POST /api/watcher/heartbeat`
- `POST /api/watcher/messages`
- `GET /api/health`

## Fixture and sample payloads

- `fixtures/sample-messages.json`
- `fixtures/mock-config.json`
- `examples/ingest-message.sample.json`
- `examples/watcher-heartbeat.sample.json`
- `examples/telegram-channel.sample.json`
- `examples/evaluation-result.sample.json`

## Windows note

- This repo uses `next dev --webpack` and `next build --webpack` by default to avoid a Turbopack junction/symlink issue with Prisma on Windows.

## Supabase note

- Set `DATABASE_URL` to the pooled connection string.
- Set `DIRECT_URL` to the direct connection string for Prisma migrations.
- If `.env` still contains `[YOUR-PASSWORD]`, Prisma cannot connect until you replace that placeholder with your real database password.

## Current limitations

- Phase 1 supports Telegram only for actual delivery.
- Watcher simulator runs a mock adapter; no real source adapter is included.
- Delivery queue is PostgreSQL-backed and intentionally simple for MVP scale.
- Soft delete is not implemented; destructive admin deletes are hard deletes in MVP.
