# 04. Agent Execution Plan

## Pha 1 — Access và inventory

Agent phải:
- SSH vào VPS.
- Ghi lại:
  - OS
  - current user
  - home dir
  - Node/pnpm/npm versions
  - git version
  - browser executable/version
  - running browser processes
  - desktop/display context
  - free disk/memory
- Tìm repo path hiện có nếu repo đã được clone.
- Không sửa gì ở pha này ngoài các lệnh kiểm tra an toàn.

## Pha 2 — Backup và safety net

Agent phải:
- backup browser/profile state,
- backup repo state nếu repo đã có,
- ghi lại profile path, launch command, display context,
- tạo notes rollback ngắn.

## Pha 3 — Repo bootstrap / align

Agent phải:
- đọc docs trong repo nếu đã có,
- align structure theo source-of-truth docs,
- install dependencies,
- tạo env files cần thiết,
- chạy typecheck/lint/build nếu có.

## Pha 4 — Core platform

Agent phải lần lượt hoàn thiện:
- auth
- dashboard shell
- groups/rules/channels CRUD
- ingest API
- rule engine
- dedupe
- logs
- notification worker
- Telegram provider

## Pha 5 — Watcher simulator

Agent phải:
- tạo watcher simulator nếu chưa có,
- chạy flow end-to-end qua simulator,
- lưu lại command và sample payloads.

## Pha 6 — Watcher thật, cực kỳ thận trọng

Agent chỉ được tiến sang bước này nếu:
- core platform đã chạy,
- simulator đã chạy,
- browser/profile đã backup,
- attach/launch strategy đã rõ,
- có rollback path.

Nếu không chắc, agent phải dừng ở watcher simulator và báo rõ:
- blocker là gì,
- thiếu thông tin gì,
- bước nào nguy hiểm cho session hiện có.

## Quy tắc báo cáo

Sau mỗi pha, agent phải báo:
1. What changed
2. Files added/updated
3. VPS changes made
4. Safety/backup status
5. How to run/test
6. Known limitations
7. Next step
