# 15. Agent Workflow

## 1. Cách agent phải làm việc
Agent không được viết code ngẫu hứng. Agent phải:

1. đọc `AGENT_START_HERE.md`
2. đọc theo đúng thứ tự tài liệu
3. dựng skeleton trước
4. triển khai theo milestone
5. thêm test cho từng milestone
6. chỉ chuyển sang milestone sau khi milestone hiện tại chạy được

## 2. Quy tắc thi công
- giữ code đơn giản và rõ ràng
- không thêm thư viện không cần thiết
- không đổi kiến trúc đã chốt nếu chưa cập nhật docs
- nếu cần thay đổi, phải sửa docs trước hoặc cùng lúc
- không block project vì thiếu source adapter thật
- dùng mock adapter để hoàn thiện pipeline

## 3. Quy tắc dữ liệu
- mọi schema thay đổi phải đi qua Prisma migration
- seed phải idempotent hoặc ít nhất an toàn khi chạy lại có kiểm soát
- không lưu secret plaintext nếu không bắt buộc

## 4. Quy tắc API
- mọi input validate bằng schema
- mọi lỗi trả JSON rõ ràng
- route nhạy cảm phải có auth guard
- watcher routes dùng Bearer token riêng

## 5. Quy tắc test
- test core domain trước UI
- matcher và dedupe phải có unit tests
- ingest flow phải có integration test
- worker phải có provider mock test

## 6. Quy tắc logging
- log có context:
  - module
  - action
  - message id hoặc watcher id nếu có
- không log secrets

## 7. Cách xử lý khi có điểm chưa rõ
Ưu tiên:
1. làm phương án đơn giản nhất
2. không phá vỡ decisions đã chốt
3. thêm TODO hoặc docs note cho phần deferred

## 8. Deliverables cuối mỗi milestone
Agent nên tạo ra:
- code chạy được
- migration nếu có
- test tương ứng
- cập nhật README hoặc docs nếu hành vi thay đổi
- checklist trạng thái milestone

## 9. Checklist agent tự kiểm trước khi dừng
- app có build được không
- migrations chạy được không
- login hoạt động không
- mock watcher gửi được message chưa
- log hiển thị đúng chưa
- Telegram provider/mock provider chạy chưa
- tests pass chưa
