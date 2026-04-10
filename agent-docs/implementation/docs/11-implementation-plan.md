# 11. Implementation Plan

## 1. Mục tiêu
Kế hoạch này chia nhỏ dự án thành các mốc mà agent có thể triển khai tuần tự, kiểm thử dần, không phụ thuộc source adapter thật.

## 2. Milestone 0 - Bootstrap
### Kết quả
- khởi tạo Next.js TypeScript app
- cài Prisma + PostgreSQL
- tạo cấu trúc thư mục chuẩn
- tạo env parser
- tạo logger cơ bản

### Task
- T001 scaffold project
- T002 setup Prisma
- T003 setup lint/format/test base
- T004 tạo folder structure
- T005 tạo README setup cơ bản

## 3. Milestone 1 - Auth
### Kết quả
- login/logout
- session table
- protected dashboard

### Task
- T101 Prisma models User/Session
- T102 seed admin user
- T103 auth service
- T104 login route
- T105 logout route
- T106 auth guard/middleware
- T107 login page

## 4. Milestone 2 - Groups và Rules
### Kết quả
- CRUD groups
- CRUD rules
- mapping group-rules
- UI cho admin

### Task
- T201 Prisma models SourceGroup/Rule/GroupRule
- T202 groups API
- T203 rules API
- T204 group-rules API
- T205 groups page
- T206 rules page
- T207 group-rule assignment UI

## 5. Milestone 3 - Ingest và Matching
### Kết quả
- ingest API chạy được
- normalize
- dedupe
- match
- log

### Task
- T301 Prisma models InboundMessage/MessageMatch
- T302 ingest schemas
- T303 watcher auth guard
- T304 normalize service
- T305 matcher service
- T306 dedupe service
- T307 ingest route
- T308 logs API
- T309 logs page

## 6. Milestone 4 - Notification
### Kết quả
- Telegram channel config
- notification job table
- worker gửi được tin

### Task
- T401 Prisma models NotificationChannel/NotificationJob
- T402 channels API
- T403 channels page
- T404 notification job creator
- T405 telegram provider
- T406 worker polling loop
- T407 retry logic
- T408 test send action

## 7. Milestone 5 - Watcher
### Kết quả
- watcher runtime
- mock adapter
- config sync
- heartbeat
- end-to-end pipeline bằng dữ liệu giả

### Task
- T501 WatcherNode model
- T502 watcher config API
- T503 heartbeat API
- T504 watcher runtime
- T505 mock adapter
- T506 fixture messages
- T507 watcher status page

## 8. Milestone 6 - Hardening
### Kết quả
- unit tests
- integration tests
- health endpoint
- deployment docs
- seed và bootstrap script hoàn thiện

### Task
- T601 unit tests matcher/dedupe
- T602 integration tests auth/API
- T603 worker tests
- T604 health endpoint
- T605 env.example
- T606 Dockerfile + compose gợi ý
- T607 final README

## 9. Thứ tự bắt buộc
Không nhảy milestone theo cảm tính. Agent nên làm:
1. bootstrap
2. auth
3. groups/rules
4. ingest/match
5. notification
6. watcher
7. hardening

## 10. Quy tắc commit logical units
Khuyến nghị mỗi milestone nên chia commit hoặc PR nhỏ theo:
- schema/data
- API/service
- UI
- tests

## 11. Kết quả cuối phase 1
- một admin có thể login
- cấu hình groups/rules/channels
- mock watcher đẩy message
- hệ thống match và gửi Telegram
- logs hiển thị đầy đủ
