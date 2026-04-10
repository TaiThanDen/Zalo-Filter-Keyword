# 07. Admin Web Spec

## 1. Mục tiêu UI
UI dành cho admin nội bộ, ưu tiên:
- rõ ràng
- nhanh thao tác
- dễ debug
- không cần quá nhiều animation

## 2. Danh sách trang

### 2.1 Login Page
Đường dẫn: `/login`

Thành phần:
- email
- password
- submit button
- lỗi đăng nhập

Yêu cầu:
- redirect vào dashboard nếu login thành công
- chặn vào login nếu đã có session

### 2.2 Dashboard
Đường dẫn: `/dashboard`

Cards tối thiểu:
- tổng số groups
- số groups đang bật
- số rules active
- số match trong 24 giờ
- số watcher online
- số notification failed chưa xử lý

### 2.3 Groups Page
Đường dẫn: `/groups`

Bảng tối thiểu:
- name
- source
- externalId
- enabled
- watcher
- updatedAt
- actions

Chức năng:
- tạo group
- sửa group
- toggle enabled
- gán watcher
- mở màn hình gán rules

### 2.4 Rules Page
Đường dẫn: `/rules`

UI nên có:
- tab `Include`
- tab `Exclude`
- filter active/inactive
- filter match type
- search by pattern

Form fields:
- type
- pattern
- matchType
- caseSensitive
- isActive
- note

### 2.5 Group Rule Assignment
Có thể là modal hoặc nested page.

Mục tiêu:
- chọn một group
- thấy danh sách rules có sẵn
- chọn/bỏ chọn rules
- save mapping

### 2.6 Channels Page
Đường dẫn: `/channels`

Phase 1 chỉ cần:
- Telegram channel form
- active toggle
- validate bot token/chat id không rỗng

Có thể thêm:
- test send button

### 2.7 Logs Page
Đường dẫn: `/logs`

Bảng tối thiểu:
- message time
- group
- sender
- short text
- decision
- matched include
- matched exclude
- notification status
- actions

Bộ lọc:
- group
- decision
- date range
- search text

Detail view:
- full message text
- fingerprint
- raw payload
- jobs
- attempts
- errors

### 2.8 Watchers Page
Đường dẫn: `/watchers`

Bảng:
- watcher name
- status
- lastHeartbeatAt
- version
- groups assigned

Trạng thái:
- online
- degraded
- offline

## 3. Layout
- sidebar trái
- topbar có user email + logout
- content area đơn giản
- table và form ưu tiên tính dùng được

## 4. UX Rules
- thao tác save phải có success/error toast
- delete nên có confirm
- toggle enabled phải phản hồi ngay
- form có validation message
- logs detail nên mở nhanh, không chuyển trang quá nhiều nếu không cần

## 5. Access Control
- toàn bộ dashboard routes yêu cầu session
- API tương ứng cũng yêu cầu session
- watcher endpoints không dùng session, dùng Bearer token riêng

## 6. Trạng thái empty
Phải có empty state cho:
- chưa có group
- chưa có rule
- chưa có channel
- chưa có logs
- chưa có watcher

## 7. UI scope cho phase 1
Bắt buộc:
- login
- dashboard
- groups CRUD
- rules CRUD
- channels edit
- logs list + detail
- watchers status

Tùy chọn:
- dark mode
- analytics charts
- bulk actions
