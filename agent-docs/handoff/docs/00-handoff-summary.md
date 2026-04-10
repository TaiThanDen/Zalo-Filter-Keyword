# 00. Handoff Summary

## Mục tiêu

Thiết lập và hoàn thiện hệ thống theo dõi message Zalo trên VPS, với các phần chính:

- Zalo đã được đăng nhập sẵn trên VPS.
- Không dùng Anti-Detect.
- Không yêu cầu agent tìm cách né phát hiện.
- Ưu tiên giữ nguyên phiên đăng nhập đang hoạt động.
- Dự án backend/admin là một repo Next.js fullstack TypeScript.
- Cần có:
  - admin web có đăng nhập,
  - quản lý group,
  - quản lý include/exclude rules,
  - ingest API,
  - log,
  - dedupe,
  - notification,
  - worker,
  - watcher hoặc watcher simulator.

## Điều rất quan trọng

Agent **không được**:
- xoá profile browser hiện tại,
- logout Zalo,
- clear cookies / local storage / browser profile,
- reboot VPS bừa bãi,
- đổi profile Chromium đang giữ phiên nếu chưa backup,
- làm thay đổi lớn mà không có backup hoặc rollback path.

## Ưu tiên thực hiện

1. Kiểm tra và backup trạng thái hiện tại của VPS và profile browser.
2. Xác nhận agent SSH vào VPS được.
3. Khảo sát môi trường: OS, Node, npm/pnpm, git, Chromium, display/session manager.
4. Setup repo dự án.
5. Setup database, env, auth, web admin, worker.
6. Setup watcher runtime theo hướng thận trọng:
   - trước tiên phải chạy được watcher simulator,
   - sau đó mới tiến tới watcher thật nếu môi trường cho phép.
7. Chỉ gắn watcher thật vào session/profile hiện có sau khi đã hiểu rõ profile path, display, launch mode, rollback path.
