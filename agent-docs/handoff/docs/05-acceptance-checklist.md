# 05. Acceptance Checklist

## Checklist bắt buộc

### Access
- [ ] SSH vào VPS thành công
- [ ] Xác minh được SSH user
- [ ] Xác minh được OS và browser environment
- [ ] Xác định được browser profile path

### Safety
- [ ] Backup browser/profile trước khi đụng tới watcher thật
- [ ] Backup repo/config trước khi sửa lớn
- [ ] Có rollback notes

### App
- [ ] Repo cài dependencies được
- [ ] App chạy được
- [ ] Auth hoạt động
- [ ] Admin pages hoạt động cơ bản

### Message pipeline
- [ ] Ingest API hoạt động
- [ ] Rule engine hoạt động
- [ ] Dedupe hoạt động
- [ ] Logs hoạt động

### Notification
- [ ] Telegram channel tạo được
- [ ] Delivery được ghi log
- [ ] Worker chạy ổn

### Watcher
- [ ] Watcher simulator chạy end-to-end
- [ ] Heartbeat hiển thị
- [ ] Nếu watcher thật được setup: có bằng chứng không làm mất session Zalo

## Điều kiện bàn giao an toàn

Agent chỉ được nói “done” khi:
- đã hoàn thành simulator end-to-end,
- và nếu có đụng watcher thật thì đã chứng minh bảo toàn session.
