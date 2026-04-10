# Zalo VPS Agent Handoff

Bộ tài liệu này để một coding agent có thể:

- đọc bối cảnh dự án,
- hiểu trạng thái hiện tại của VPS,
- biết các nguyên tắc an toàn khi đụng vào phiên Zalo đang đăng nhập,
- tự SSH vào VPS,
- kiểm tra môi trường,
- setup repo, service, worker, watcher,
- và báo cáo lại theo milestone.

## Cấu trúc bộ tài liệu

- `docs/00-handoff-summary.md`
- `docs/01-vps-access-and-safety.md`
- `docs/02-current-state.md`
- `docs/03-target-state.md`
- `docs/04-agent-execution-plan.md`
- `docs/05-acceptance-checklist.md`
- `docs/06-values-to-fill.md`
- `AGENT_PROMPT.txt`
- `AGENT_PROMPT_STRICT.txt`

## Cách dùng

1. Mở `docs/06-values-to-fill.md` và điền các giá trị còn thiếu.
2. Gửi cả bundle này cho agent.
3. Dùng `AGENT_PROMPT.txt` nếu muốn agent làm việc bình thường.
4. Dùng `AGENT_PROMPT_STRICT.txt` nếu muốn agent làm việc chặt, ít hỏi lại, ưu tiên tự kiểm tra và tự chốt assumption hợp lý.
