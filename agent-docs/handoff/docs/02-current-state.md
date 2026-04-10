# 02. Current State

## Những gì đã biết từ người dùng

- Zalo đã đăng nhập trên VPS.
- Người dùng đã thử xoá và vào lại, hiện tại vẫn không bị logout.
- Tình trạng này mới xác nhận ở mức:
  - browser mở được,
  - session tồn tại,
  - Zalo vào lại được bình thường.

## Những gì chưa được xác nhận

Agent phải tự xác minh:

- VPS chạy hệ điều hành gì
- user nào đang giữ phiên desktop/browser
- Chromium version
- profile path thật sự
- session desktop là Xfce/Xorg/xrdp hay môi trường nào khác
- repo dự án hiện đã có trên VPS chưa
- Node/pnpm/git đã sẵn chưa
- Postgres/Redis có hay chưa
- watcher thật có thể chạy bền trên môi trường hiện tại không

## Giả định làm việc

Cho tới khi agent tự xác minh:
- session Zalo hiện tại là tài sản cần bảo toàn,
- browser profile hiện tại là state quan trọng nhất,
- mọi sửa đổi phải idempotent và có rollback path.
