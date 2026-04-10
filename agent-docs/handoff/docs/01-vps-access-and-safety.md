# 01. VPS Access and Safety

## 1. Thông tin đã biết

- VPS IP: `157.245.148.160`
- Zalo hiện đã đăng nhập trên VPS và vào lại bình thường.
- Agent cần làm việc với VPS qua SSH.

## 2. SSH key hiện có

Người dùng đã tạo ED25519 key với tên:

- private key: `digitalocean_157.245.148.160`
- public key: `digitalocean_157.245.148.160.pub`

Public key đã hiển thị được trên Windows bằng lệnh:

```bat
type digitalocean_157.245.148.160.pub
```

Lưu ý:
- Trên Windows CMD, `cat` không dùng được mặc định.
- Nếu key được tạo bằng tên tương đối như trên, nhiều khả năng nó đang nằm ở:
  - `C:\Users\Tai\digitalocean_157.245.148.160`
  - `C:\Users\Tai\digitalocean_157.245.148.160.pub`

## 3. Agent phải được cung cấp gì để SSH

Trước khi agent tự SSH, cần có đủ:

- `SSH_USER`
- `SSH_HOST`
- private key tương ứng
- nếu có passphrase thì agent phải được cấp theo cách an toàn
- nếu server dùng port SSH không phải 22 thì cần `SSH_PORT`

## 4. Chuỗi SSH mẫu

```bash
ssh -i "<PRIVATE_KEY_PATH>" <SSH_USER>@157.245.148.160
```

Nếu có custom port:

```bash
ssh -i "<PRIVATE_KEY_PATH>" -p <SSH_PORT> <SSH_USER>@157.245.148.160
```

## 5. Quy tắc an toàn bắt buộc trước khi sửa gì trên VPS

Ngay sau khi SSH được vào VPS, agent phải làm theo thứ tự:

1. `whoami`
2. `hostname`
3. `pwd`
4. `uname -a`
5. xác định distro / OS release
6. kiểm tra disk space
7. kiểm tra RAM
8. kiểm tra process browser đang chạy
9. xác định profile path của Chromium/Zalo session đang dùng
10. backup profile trước khi đụng gì vào browser automation

## 6. Những thứ phải backup

### 6.1 Browser / Zalo session
Backup ít nhất:
- Chromium user data dir
- profile mặc định đang dùng
- desktop shortcut / launch script nếu có custom flags
- các thư mục cấu hình liên quan nếu phát hiện

### 6.2 Project / code
Nếu repo đã tồn tại:
- `git status`
- `git remote -v`
- branch hiện tại
- tạo branch mới hoặc backup patch trước khi sửa

### 6.3 System config
Nếu động vào service/systemd/nginx/pm2:
- export file config cũ ra bản backup có timestamp

## 7. Browser safety rules

Agent không được:
- chạy lệnh xóa profile,
- khởi chạy Chromium với profile mới rồi đè profile cũ,
- clear cache/cookies/storage bừa bãi,
- kill browser chính nếu chưa biết launch mode,
- đổi ownership/perms của profile folder nếu chưa hiểu tác động.

## 8. Chiến lược an toàn cho watcher thật

Nếu agent muốn thử automation trên phiên đang đăng nhập:
- ưu tiên **read-only inspection** trước,
- xác định chính xác browser executable, display, user-data-dir, profile-dir,
- ưu tiên attach hoặc launch với profile hiện có, không tạo clean profile mới mặc định,
- nếu không chắc, dừng ở watcher simulator và document rõ blocker.
