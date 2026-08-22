# Kế hoạch watcher realtime nhẹ tải và lịch nghỉ

## Mục tiêu

- Phát hiện tin Zalo gần realtime mà không quét toàn bộ giao diện liên tục.
- Giảm CPU Chromium/Playwright trên VPS và giảm request không cần thiết tới Vercel/Supabase.
- Cho phép quản trị lịch nghỉ hằng ngày trên web.
- Mặc định nghỉ từ `01:00` đến `06:00`, múi giờ `Asia/Ho_Chi_Minh`.
- Trong giờ nghỉ, watcher **không đọc, không lưu, không gửi bù** tin Zalo phát sinh trong khoảng đó.
- Giữ nguyên Chromium profile và phiên Zalo đang đăng nhập.

## Kiến trúc mục tiêu

### Phát hiện tin

1. Gắn `MutationObserver` vào vùng danh sách hội thoại Zalo.
2. Debounce các thay đổi DOM trong thời gian ngắn và gom nhiều mutation thành một lần xử lý.
3. Chạy cùng pipeline đọc tin, chống trùng và lọc luật hiện có.
4. Giữ safety poll định kỳ để tự phục hồi khi observer bị mất do Zalo thay DOM hoặc reload trang.
5. Mỗi lần safety poll hoàn tất sẽ gắn lại observer vào node danh sách hiện tại.

### Lịch nghỉ

1. Lưu cấu hình theo từng watcher trong Supabase:
   - bật/tắt lịch nghỉ;
   - phút bắt đầu và phút kết thúc trong ngày;
   - múi giờ IANA cố định mặc định `Asia/Ho_Chi_Minh`.
2. Trang Watcher cho phép quản trị trực tiếp các trường trên.
3. API config trả lịch nghỉ cùng danh sách nhóm và luật.
4. Runtime kiểm tra lịch bằng đồng hồ theo múi giờ cấu hình.
5. Khi bước vào giờ nghỉ:
   - hủy timer poll;
   - tháo `MutationObserver`;
   - không đọc DOM và không gọi API ingest;
   - giữ Chromium và process PM2 hoạt động;
   - ngừng heartbeat định kỳ, nhưng vẫn đồng bộ config nhẹ để thay đổi từ web có thể được nhận.
6. Khi kết thúc giờ nghỉ:
   - chạy một vòng baseline chỉ để ghi nhận trạng thái DOM hiện tại;
   - không emit các tin xuất hiện trong giờ nghỉ;
   - gắn lại observer;
   - gửi heartbeat online và trở về realtime.

## Hành vi qua ngày

- Hỗ trợ lịch cùng ngày, ví dụ `01:00–06:00`.
- Hỗ trợ lịch qua nửa đêm, ví dụ `23:00–06:00`.
- Thời điểm bắt đầu được tính là nằm trong giờ nghỉ; thời điểm kết thúc không còn nằm trong giờ nghỉ.
- Nếu lịch bị tắt trên web, watcher tiếp tục hoạt động sau lần đồng bộ config kế tiếp.
- Không thay đổi định dạng Telegram, luật include/exclude hoặc cơ chế chống trùng hiện tại.

## Thay đổi dữ liệu và API

- Thêm bảng cấu hình runtime một-một theo watcher, với giá trị mặc định an toàn.
- Thêm migration chỉ bổ sung bảng/index, không xóa hoặc sửa dữ liệu hiện hữu.
- Thêm endpoint admin có xác thực để cập nhật lịch.
- Mở rộng `/api/watcher/config` để trả lịch nghỉ cho đúng watcher.

## Giao diện web

Tại trang Watcher, mỗi watcher có form:

- checkbox `Bật lịch nghỉ`;
- giờ bắt đầu;
- giờ kết thúc;
- múi giờ hiển thị là `Asia/Ho_Chi_Minh`;
- nút lưu;
- trạng thái `Đang nghỉ` khi thời gian hiện tại nằm trong lịch.

## An toàn và chống mất phiên

- Không dừng hoặc xóa process Chromium.
- Không xóa, đổi tên hoặc dùng chung Chromium profile.
- Không tự động phát lại tin trong giờ nghỉ.
- Observer chỉ theo dõi vùng hội thoại, không theo dõi toàn bộ `body` để tránh mutation storm.
- Mọi callback Playwright đi qua hàng đợi tuần tự hiện có để tránh hai thao tác browser chạy đồng thời.

## Kiểm thử và tiêu chí nghiệm thu

- Unit test tính giờ nghỉ theo `Asia/Ho_Chi_Minh`, gồm lịch cùng ngày và qua nửa đêm.
- Unit test chuẩn hóa `HH:mm` sang phút và ngược lại.
- Unit test adapter: pause hủy lịch quét; resume baseline không emit tin cũ.
- Typecheck, lint, toàn bộ unit test và production build đều thành công.
- Migration chạy thành công trên Supabase.
- Web lưu và đọc lại được cấu hình `01:00–06:00`.
- VPS log xác nhận observer được gắn, watcher vào/ra pause đúng trạng thái.
- Trong giờ nghỉ không có log poll, ingest hoặc heartbeat.
- Chromium, worker và watcher vẫn online trong PM2.

## Trình tự triển khai production

1. Backup source, `.env`, PM2 dump, watcher state và log trên VPS.
2. Commit code và migration cục bộ nhưng chưa cập nhật runtime.
3. Chạy migration bổ sung trên Supabase trước khi backend mới nhận traffic.
4. Push GitHub để Vercel build/deploy.
5. Đồng bộ đúng commit sang VPS, giữ nguyên `.env`, `data`, `node_modules` và Chromium profile.
6. Cập nhật safety poll, restart watcher/healthcheck bằng PM2 và lưu PM2 dump.
7. Đặt cấu hình production mặc định `01:00–06:00`, `Asia/Ho_Chi_Minh`, bật lịch nghỉ.
8. Kiểm tra API config, log watcher, PM2 restart count và một vòng observer/poll.

## Rollback

- Khôi phục archive source và `.env` từ backup VPS.
- Restart watcher/healthcheck rồi `pm2 save`.
- Bảng cấu hình mới có thể giữ lại vì code cũ không sử dụng; không cần migration phá hủy dữ liệu để rollback runtime.
