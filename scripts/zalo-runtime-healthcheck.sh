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
PAUSE_WATCHER_FILE="${HEALTHCHECK_STATE_DIR}/pause-watcher"
STALE_RESTART_STATE_FILE="${HEALTHCHECK_STATE_DIR}/last-stale-restart"
UI_STALE_RESTART_STATE_FILE="${HEALTHCHECK_STATE_DIR}/last-ui-stale-restart"
STALE_ERROR_PATTERN='Target page, context or browser has been closed'
STALE_ERROR_THRESHOLD=6
STALE_ERROR_WINDOW_SECONDS=180
STALE_RESTART_COOLDOWN_SECONDS=180
UI_STALE_RESTART_COOLDOWN_SECONDS=180
MIN_HEALTHY_ROW_COUNT=5
WATCHER_MANAGED_PAGE_SESSION_KEY="__zalo_watcher_managed"
export WATCHER_MANAGED_PAGE_SESSION_KEY

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

if [ -f "${PAUSE_WATCHER_FILE}" ]; then
  exit 0
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
UI_LAST_RESTART_EPOCH=0

if [ -f "${UI_STALE_RESTART_STATE_FILE}" ]; then
  UI_LAST_RESTART_EPOCH="$(cat "${UI_STALE_RESTART_STATE_FILE}" 2>/dev/null || echo 0)"
fi

PAGE_HEALTH_JSON="$(
  node - <<'NODE'
const { chromium } = require('playwright-core');

const WATCHER_MANAGED_PAGE_SESSION_KEY = process.env.WATCHER_MANAGED_PAGE_SESSION_KEY ?? '__zalo_watcher_managed';

function normalize(value) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

(async () => {
  const result = {
    maxRowCount: 0,
    managedRowCount: 0,
    managedSearchActive: false,
    managedActivationPrompt: false,
    managedSearchResultList: false,
  };

  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];

    for (const page of context?.pages() ?? []) {
      if (!page.url().startsWith('https://chat.zalo.me')) {
        continue;
      }

      const [rowCount, searchValue, isManaged, bodyText, hasSearchResultList] = await Promise.all([
        page
          .evaluate(() => {
            const selectors = [
              '#conversationList .msg-item[data-id="div_TabMsg_ThrdChItem"]',
              '#conversationList .msg-item',
              '#conversationList [anim-data-id]',
              '.conv-list .conv-item',
              '.conv-item[anim-data-id]',
            ];
            return selectors.reduce(
              (maxCount, selector) => Math.max(maxCount, document.querySelectorAll(selector).length),
              0,
            );
          })
          .catch(() => 0),
        page.locator('#contact-search-input, input[data-id="txt_Main_Search"], input[type="search"]')
          .first()
          .inputValue()
          .catch(() => ''),
        page
          .evaluate((storageKey) => window.sessionStorage.getItem(storageKey) === '1', WATCHER_MANAGED_PAGE_SESSION_KEY)
          .catch(() => false),
        page.locator('body').innerText().then((value) => value.slice(0, 400)).catch(() => ''),
        page.locator('#searchResultList').count().then((value) => value > 0).catch(() => false),
      ]);

      result.maxRowCount = Math.max(result.maxRowCount, rowCount);

      if (!isManaged) {
        continue;
      }

      result.managedRowCount = Math.max(result.managedRowCount, rowCount);

      const normalizedBodyText = normalize(bodyText);
      const activationPrompt =
        normalizedBodyText.includes('ban dang mo zalo tren mot tab khac') ||
        normalizedBodyText.includes('nhan kich hoat de su dung tren tab nay') ||
        normalizedBodyText.includes('dang dang nhap');
      if ((searchValue ?? '').trim()) {
        result.managedSearchActive = true;
      }

      if (hasSearchResultList) {
        result.managedSearchResultList = true;
        result.managedSearchActive = true;
      }

      if (
        normalizedBodyText.includes('tat ca') &&
        normalizedBodyText.includes('lien he') &&
        normalizedBodyText.includes('tin nhan') &&
        normalizedBodyText.includes('file') &&
        normalizedBodyText.includes('dong')
      ) {
        result.managedSearchActive = true;
      }

      if (activationPrompt) {
        result.managedActivationPrompt = true;
      }
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  console.log(JSON.stringify(result));
})();
NODE
)"

UI_MAX_ROW_COUNT="$(
  printf '%s' "${PAGE_HEALTH_JSON}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s||'{}');console.log(Number(data.maxRowCount||0))})"
)"
UI_MANAGED_ROW_COUNT="$(
  printf '%s' "${PAGE_HEALTH_JSON}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s||'{}');console.log(Number(data.managedRowCount||0))})"
)"
UI_MANAGED_SEARCH_ACTIVE="$(
  printf '%s' "${PAGE_HEALTH_JSON}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s||'{}');console.log(data.managedSearchActive ? '1' : '0')})"
)"
UI_MANAGED_ACTIVATION_PROMPT="$(
  printf '%s' "${PAGE_HEALTH_JSON}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s||'{}');console.log(data.managedActivationPrompt ? '1' : '0')})"
)"
UI_MANAGED_SEARCH_RESULT_LIST="$(
  printf '%s' "${PAGE_HEALTH_JSON}" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const data=JSON.parse(s||'{}');console.log(data.managedSearchResultList ? '1' : '0')})"
)"
if [ "${UI_MANAGED_ACTIVATION_PROMPT}" != "1" ] && { [ "${UI_MANAGED_SEARCH_ACTIVE}" = "1" ] || [ "${UI_MANAGED_SEARCH_RESULT_LIST}" = "1" ] || [ "${UI_MANAGED_ROW_COUNT}" -lt "${MIN_HEALTHY_ROW_COUNT}" ]; }; then
  if [ $((NOW_EPOCH - UI_LAST_RESTART_EPOCH)) -ge "${UI_STALE_RESTART_COOLDOWN_SECONDS}" ]; then
    echo "${NOW_EPOCH}" > "${UI_STALE_RESTART_STATE_FILE}"
    restart_chromium
    sleep 10
    restart_watcher
  fi
fi

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
