# 13. Acceptance Criteria

## 1. Auth
- admin login bằng email/password hoạt động
- session cookie được set sau login
- dashboard routes bị chặn nếu không có session
- logout xóa hoặc vô hiệu session

## 2. Groups
- admin tạo group được
- admin sửa tên và trạng thái enabled được
- mỗi group lưu được source + externalId
- không tạo trùng `(source, externalId)`

## 3. Rules
- admin tạo include/exclude rules được
- hỗ trợ `CONTAINS` và `WHOLE_WORD`
- admin bật/tắt rule được
- admin gán rules cho group được

## 4. Ingest
- watcher có Bearer token hợp lệ mới ingest được
- ingest payload hợp lệ sẽ được lưu inbound
- hệ thống tạo MessageMatch cho mỗi inbound message
- duplicate không tạo notification lặp

## 5. Matching
- group disabled không được notify
- không có include hit thì reject
- có include hit nhưng dính exclude thì reject
- matched phải lưu danh sách keyword trúng

## 6. Notifications
- có thể tạo Telegram channel
- khi matched thì tạo NotificationJob
- worker xử lý NotificationJob và cập nhật trạng thái
- lỗi gửi được ghi lại ở job

## 7. Logs
- admin xem được logs
- logs hiển thị decision
- logs detail hiển thị raw payload, fingerprint, jobs

## 8. Watchers
- watcher có thể fetch config
- watcher gửi heartbeat được
- admin thấy last heartbeat
- trạng thái watcher phản ánh online/offline theo TTL

## 9. End-to-end acceptance
Dự án phase 1 đạt nếu có demo sau:
1. login admin
2. tạo group
3. tạo rules
4. gán rules
5. cấu hình Telegram
6. chạy mock watcher
7. gửi message mẫu
8. thấy log matched
9. thấy job sent

## 10. Documentation acceptance
Repo phải có:
- README
- env.example
- setup instructions
- migration instructions
- seed instructions
- watcher/worker run instructions
