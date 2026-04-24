#!/usr/bin/env bash
set -euo pipefail

cd /root/apps/zalo-keyword-filter

export DISPLAY="${DISPLAY:-:10}"
export XAUTHORITY="${XAUTHORITY:-/root/.Xauthority}"

CHROMIUM_PORT="127.0.0.1:9222"
WATCHER_NAME="zalo-watcher"
CHROMIUM_NAME="zalo-chromium"
WATCHER_ERROR_LOG="/root/.pm2/logs/${WATCHER_NAME}-error.log"
HEALTHCHECK_STATE_DIR="/root/.cache/zalo-runtime-healthcheck"
STALE_RESTART_STATE_FILE="${HEALTHCHECK_STATE_DIR}/last-stale-restart"
STALE_ERROR_PATTERN='Target page, context or browser has been closed'
STALE_ERROR_THRESHOLD=6
STALE_ERROR_WINDOW_SECONDS=180
STALE_RESTART_COOLDOWN_SECONDS=180

mkdir -p "${HEALTHCHECK_STATE_DIR}"

restart_chromium() {
  pm2 restart "${CHROMIUM_NAME}" --update-env >/dev/null 2>&1 \
    || pm2 start scripts/start-zalo-chromium.sh --name "${CHROMIUM_NAME}" --interpreter bash --restart-delay 5000 --update-env >/dev/null 2>&1
}

restart_watcher() {
  pm2 restart "${WATCHER_NAME}" --update-env >/dev/null 2>&1 \
    || pm2 start npm --name "${WATCHER_NAME}" -- run watcher >/dev/null 2>&1
}

if ! ss -ltn | grep -q "${CHROMIUM_PORT}"; then
  restart_chromium
  sleep 10
fi

pm2 describe "${WATCHER_NAME}" >/dev/null 2>&1 || restart_watcher

WATCHER_COUNT="$(
  pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const list=JSON.parse(s||'[]');console.log(list.filter(p=>p.name==='${WATCHER_NAME}').length)})"
)"

if [ "${WATCHER_COUNT}" -gt 1 ]; then
  pm2 delete "${WATCHER_NAME}" >/dev/null 2>&1 || true
  sleep 2
  restart_watcher
fi

WATCHER_STATUS=$(
  pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const list=JSON.parse(s||'[]');const app=list.find(p=>p.name==='${WATCHER_NAME}');console.log(app?.pm2_env?.status||'missing')})"
)

if [ "${WATCHER_STATUS}" != "online" ]; then
  restart_watcher
fi

NOW_EPOCH="$(date +%s)"
LAST_RESTART_EPOCH=0

if [ -f "${STALE_RESTART_STATE_FILE}" ]; then
  LAST_RESTART_EPOCH="$(cat "${STALE_RESTART_STATE_FILE}" 2>/dev/null || echo 0)"
fi

if [ -f "${WATCHER_ERROR_LOG}" ]; then
  ERROR_LOG_MTIME="$(stat -c %Y "${WATCHER_ERROR_LOG}" 2>/dev/null || echo 0)"

  if [ $((NOW_EPOCH - ERROR_LOG_MTIME)) -le "${STALE_ERROR_WINDOW_SECONDS}" ]; then
    STALE_ERROR_COUNT="$(tail -n 80 "${WATCHER_ERROR_LOG}" | grep -c "${STALE_ERROR_PATTERN}" || true)"

    if [ "${STALE_ERROR_COUNT}" -ge "${STALE_ERROR_THRESHOLD}" ] && [ $((NOW_EPOCH - LAST_RESTART_EPOCH)) -ge "${STALE_RESTART_COOLDOWN_SECONDS}" ]; then
      echo "${NOW_EPOCH}" > "${STALE_RESTART_STATE_FILE}"
      restart_chromium
      sleep 10
      restart_watcher
    fi
  fi
fi
