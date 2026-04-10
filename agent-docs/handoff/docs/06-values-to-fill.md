# 06. Values To Fill

Điền các giá trị này trước khi giao cho agent nếu agent chưa tự truy cập được secret store.

## SSH

- `SSH_HOST=157.245.148.160`
- `SSH_USER=root`
- `SSH_PORT=22` hoặc `<fill>`
- `SSH_PRIVATE_KEY_PATH_LOCAL=<fill>`
- `SSH_PRIVATE_KEY_CONTENT=<fill securely if needed>`
- `SSH_KEY_PASSPHRASE=<fill if any>`

## Repo

- `REPO_URL=<fill>`
- `REPO_PATH_ON_VPS=<fill if repo already exists>`
- `DEFAULT_BRANCH=<fill>`

## App

- `APP_PORT=<fill or default>`
- `APP_BASE_URL=<fill>`
- `DATABASE_URL=<fill>`
- `TELEGRAM_BOT_TOKEN=<fill>`
- `TELEGRAM_CHAT_ID=<fill>`

## Watcher

- `WATCHER_MODE=simulator|real`
- `WATCHER_USER_DATA_DIR=<fill after discovery>`
- `WATCHER_PROFILE_DIR=<fill after discovery>`
- `WATCHER_DISPLAY=<fill after discovery>`
- `WATCHER_SESSION_USER=<fill after discovery>`

## Safety

- `ALLOW_REAL_WATCHER_SETUP=true|false`
- `ALLOW_BROWSER_RESTART=true|false`
- `ALLOW_SYSTEM_REBOOT=true|false`

### Khuyến nghị ban đầu

- `ALLOW_REAL_WATCHER_SETUP=true` chỉ khi bạn chấp nhận agent động tới browser profile sau khi đã backup.
- `ALLOW_BROWSER_RESTART=false` ở pass đầu.
- `ALLOW_SYSTEM_REBOOT=false` ở pass đầu.
