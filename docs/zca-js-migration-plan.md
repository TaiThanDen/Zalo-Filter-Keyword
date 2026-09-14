# Kế hoạch chuyển watcher sang zca-js

## Phạm vi

- Thay Playwright/CDP bằng một listener `zca-js` headless trên VPS.
- Giữ nguyên web quản trị, Supabase, luật keyword, chống trùng, hàng đợi và Telegram worker.
- Không thay đổi trạng thái chạy/dừng do người quản trị đặt.
- Không tác động Zoom Recorder hoặc các project khác trên VPS.

## Các cổng kiểm soát

1. **Backup:** checkpoint Git/tag, dump Supabase đã kiểm tra bằng `pg_restore -l`, backup `.env` và cấu hình PM2 trước cutover.
2. **Kiểm thử code:** typecheck, lint, unit test và production build phải cùng thành công.
3. **Preview:** push branch để Vercel tạo build/preview; kiểm tra health và các trang quản trị.
4. **Canary VPS:** release mới ở thư mục riêng; listener kết nối trong khi watcher vẫn ở trạng thái nghiệp vụ dừng.
5. **E2E có người dùng:** người quản trị cho chạy và gửi một tin nhóm chứa keyword; xác nhận đúng một bản ghi và một thông báo Telegram.
6. **Cutover:** chỉ thay riêng PM2 của Zalo sau canary; giữ release cũ để rollback.

## Tiêu chí rollback

- Không đăng nhập được hoặc listener kết nối không ổn định.
- Không đồng bộ được nhóm đã cấu hình.
- Tin kiểm thử không tới Telegram, tới sai nội dung hoặc bị gửi trùng.
- Tài nguyên watcher tăng bất thường hoặc ảnh hưởng tiến trình dùng chung VPS.

Rollback là dừng listener mới và khởi động lại các process Zalo từ release cũ. Không phục hồi database trừ khi có thay đổi dữ liệu ngoài dự kiến; migration này không có thay đổi schema.
