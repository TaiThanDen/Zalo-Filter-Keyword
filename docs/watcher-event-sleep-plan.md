# Watcher realtime và lịch nghỉ

## Mục tiêu

- Nhận tin nhắn nhóm Zalo theo sự kiện websocket bằng `zca-js`.
- Không cần Chromium, Playwright, GUI, VNC hoặc quét DOM trên VPS.
- Cho phép quản trị lịch nghỉ hằng ngày trên web.
- Mặc định nghỉ từ `01:00` đến `06:00`, múi giờ `Asia/Ho_Chi_Minh`.
- Trong giờ nghỉ, watcher **không đọc, không lưu, không gửi bù** tin Zalo phát sinh trong khoảng đó.
- Lưu phiên đăng nhập Zalo trong tệp credentials riêng, quyền `0600`.

## Kiến trúc mục tiêu

### Phát hiện tin

1. Đăng nhập bằng credentials đã lưu; nếu chưa có hoặc hết hạn thì tạo mã QR.
2. Mở một listener websocket và chỉ nhận tin nhắn nhóm từ tài khoản khác.
3. Chuẩn hóa sự kiện về contract ingest hiện có.
4. Dùng pipeline chống trùng, lọc luật và hàng đợi Telegram hiện có.
5. Tự kết nối lại với exponential backoff có giới hạn khi socket bị ngắt.

### Lịch nghỉ

1. Lưu cấu hình theo từng watcher trong Supabase:
   - bật/tắt lịch nghỉ;
   - phút bắt đầu và phút kết thúc trong ngày;
   - múi giờ IANA cố định mặc định `Asia/Ho_Chi_Minh`.
2. Trang Watcher cho phép quản trị trực tiếp các trường trên.
3. API config trả lịch nghỉ cùng danh sách nhóm và luật.
4. Runtime kiểm tra lịch bằng đồng hồ theo múi giờ cấu hình.
5. Khi bước vào giờ nghỉ:
   - giữ phiên websocket hoạt động;
   - bỏ qua sự kiện đến và không gọi API ingest;
   - ngừng heartbeat định kỳ, nhưng vẫn đồng bộ config nhẹ để thay đổi từ web có thể được nhận.
6. Khi kết thúc giờ nghỉ:
   - không gửi bù các tin đã bị bỏ qua trong giờ nghỉ;
   - gửi heartbeat online và trở về realtime.

## Hành vi qua ngày

- Hỗ trợ lịch cùng ngày, ví dụ `01:00–06:00`.
- Hỗ trợ lịch qua nửa đêm, ví dụ `23:00–06:00`.
- Thời điểm bắt đầu được tính là nằm trong giờ nghỉ; thời điểm kết thúc không còn nằm trong giờ nghỉ.
- Nếu lịch bị tắt trên web, watcher tiếp tục hoạt động sau lần đồng bộ config kế tiếp.
- Không thay đổi định dạng Telegram, luật include/exclude hoặc cơ chế chống trùng hiện tại.

## Dữ liệu và API

- Giữ nguyên schema Supabase vì các bảng watcher, nhóm, tin nhắn, luật và hàng đợi đều độc lập với Playwright.
- `/api/watcher/config` tiếp tục trả lịch nghỉ, nhóm và luật theo watcher.
- `/api/watcher/ingest` và worker Telegram giữ nguyên contract.

## Giao diện web

Tại trang Watcher, mỗi watcher có form:

- checkbox `Bật lịch nghỉ`;
- giờ bắt đầu;
- giờ kết thúc;
- múi giờ hiển thị là `Asia/Ho_Chi_Minh`;
- nút lưu;
- trạng thái `Đang nghỉ` khi thời gian hiện tại nằm trong lịch.

## An toàn và chống mất phiên

- Không commit credentials hoặc ảnh QR vào Git.
- Dùng đường dẫn bền vững ngoài release, khuyến nghị dưới `/var/lib/zalo-keyword-filter`.
- Chỉ chạy một listener cho cùng một tài khoản Zalo.
- Không tự động phát lại tin trong giờ nghỉ.
- Mọi callback websocket đi qua hàng đợi tuần tự để giữ đúng thứ tự ingest.

## Kiểm thử và tiêu chí nghiệm thu

- Unit test tính giờ nghỉ theo `Asia/Ho_Chi_Minh`, gồm lịch cùng ngày và qua nửa đêm.
- Unit test chuẩn hóa `HH:mm` sang phút và ngược lại.
- Unit test adapter: ánh xạ tin nhóm, bỏ tin trực tiếp/tự gửi, nội dung nhiều dòng, attachment và timestamp.
- Typecheck, lint, toàn bộ unit test và production build đều thành công.
- Web lưu và đọc lại được cấu hình `01:00–06:00`.
- VPS log xác nhận listener kết nối và watcher vào/ra pause đúng trạng thái.
- Trong giờ nghỉ không có ingest hoặc gửi Telegram.
- Worker và watcher vẫn online trong PM2; Chromium cũ được tắt sau canary thành công.

## Trình tự triển khai production

1. Backup source, `.env`, PM2 dump, watcher state và Supabase.
2. Commit/push branch migration và xác nhận Vercel build thành công.
3. Dựng release mới cạnh release cũ, không ghi đè production.
4. Dừng riêng watcher/Chromium Zalo cũ, khởi động canary `zca-js` trong khi trạng thái nghiệp vụ vẫn dừng.
5. Quét QR khi được yêu cầu, xác nhận websocket và đồng bộ nhóm.
6. Chỉ khi người quản trị chủ động cho watcher chạy, gửi tin kiểm thử chứa keyword và xác nhận đầy đủ Zalo → ingest → queue → Telegram.
7. Chuyển PM2 watcher sang release mới; tắt healthcheck/Chromium cũ; không restart PM2 toàn bộ.

## Rollback

- Dừng watcher `zca-js`, khởi động lại đúng release Playwright cũ và các tiến trình Zalo Chromium/healthcheck cũ.
- Khôi phục `.env`/PM2 config từ backup nếu đã thay đổi.
- Không cần rollback database vì migration này không thay đổi schema hoặc dữ liệu.
