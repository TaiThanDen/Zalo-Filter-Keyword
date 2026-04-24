#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:10}"
export XAUTHORITY="${XAUTHORITY:-/root/.Xauthority}"

exec /snap/bin/chromium \
  --no-sandbox \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --disable-features=VizDisplayCompositor \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/root/snap/chromium/common/chromium \
  --profile-directory=Default \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-infobars \
  https://chat.zalo.me/
