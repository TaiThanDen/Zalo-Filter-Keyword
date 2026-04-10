# 01. Product Requirements

## 1. Bối cảnh
Người dùng cần một hệ thống để quản trị và xử lý cảnh báo dựa trên tin nhắn đến từ các group chat. Hệ thống phải cho phép cấu hình linh hoạt các từ khóa cần bắt và từ khóa cần loại trừ, lưu log, và gửi thông báo ra kênh ngoài.

## 2. Mục tiêu sản phẩm
### Mục tiêu chính
- Cho phép quản trị từ khóa include/exclude linh hoạt.
- Cho phép bật/tắt group theo dõi.
- Ghi nhận các message được ingest.
- Xác định message match theo rule.
- Gửi cảnh báo qua Telegram.
- Hiển thị log và trạng thái watcher trên web admin.

### Mục tiêu kỹ thuật
- Tất cả FE và BE nằm trong cùng một repo TypeScript.
- Có thể chạy trên VPS.
- Có thể test được không cần source adapter thật.
- Có khả năng mở rộng thêm kênh thông báo.

## 3. Người dùng hệ thống
### Admin
- đăng nhập vào web
- quản lý groups
- quản lý rules
- xem logs
- cấu hình Telegram
- theo dõi watcher health

### Watcher process
- đồng bộ config
- gửi heartbeat
- gửi inbound events

### Notification recipient
- nhận cảnh báo khi có message match

## 4. Chức năng bắt buộc
### 4.1 Authentication
- đăng nhập bằng email/password
- logout
- route admin phải có bảo vệ session

### 4.2 Group Management
- tạo group
- sửa tên hiển thị
- bật/tắt theo dõi
- gán watcher node nếu cần
- lưu external id và source

### 4.3 Rule Management
- tạo/sửa/xóa include rule
- tạo/sửa/xóa exclude rule
- hỗ trợ `contains`
- hỗ trợ `whole_word`
- bật/tắt rule
- gán rule cho group
- có thể hỗ trợ global rule trong tương lai

### 4.4 Message Ingestion
- watcher gửi message event về API
- backend validate payload
- backend lưu inbound message
- backend dedupe
- backend chạy rule engine
- backend tạo notification job nếu match

### 4.5 Logs
- xem danh sách inbound messages
- xem kết quả match
- xem matched include rules
- xem matched exclude rules
- xem trạng thái notification

### 4.6 Notification
- phase 1: Telegram
- phase 2: Messenger
- lưu trạng thái gửi
- retry khi lỗi tạm thời

### 4.7 Watcher Health
- watcher gửi heartbeat
- admin thấy thời gian last heartbeat
- admin biết watcher online/offline/degraded

## 5. Non-functional requirements
- dễ triển khai trên VPS
- có seed dữ liệu dev
- có mock source để test end-to-end
- idempotent ingest
- logs đủ để debug
- không phụ thuộc vào source adapter thật để hoàn thiện core app

## 6. Out of Scope cho phase 1
- anti-detect
- source bypass details
- regex rules
- multi-tenant
- RBAC nâng cao
- dashboard analytics phức tạp
- Messenger production-ready

## 7. User Stories
### Auth
- Là admin, tôi muốn đăng nhập để vào hệ thống quản trị.
- Là admin, tôi muốn logout an toàn.

### Group
- Là admin, tôi muốn thêm group mới để theo dõi.
- Là admin, tôi muốn bật/tắt group để tạm dừng theo dõi.

### Rules
- Là admin, tôi muốn thêm include keywords như `PB`, `sup`, `mascot`.
- Là admin, tôi muốn thêm exclude keywords để giảm false positive.
- Là admin, tôi muốn gán rules cho từng group.

### Logs
- Là admin, tôi muốn xem message nào đã match và vì sao.
- Là admin, tôi muốn xem message có bị dedupe không.
- Là admin, tôi muốn xem trạng thái gửi Telegram.

### Watcher
- Là hệ thống watcher, tôi muốn lấy cấu hình đang active để chỉ theo dõi group/rule đúng.
- Là hệ thống watcher, tôi muốn gửi heartbeat để backend biết tôi còn online.

## 8. Tiêu chí thành công cho phase 1
- Có thể tạo một admin user và đăng nhập.
- Có thể cấu hình ít nhất 3 include rules và 3 exclude rules.
- Có thể ingest message mẫu qua mock watcher.
- Có ít nhất một luồng hoàn chỉnh message -> match -> Telegram -> log.
- Có thể xem log trên web.
