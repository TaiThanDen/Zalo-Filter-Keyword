#!/usr/bin/env bash
set -euo pipefail

detect_display() {
  local candidate=""

  while IFS= read -r candidate; do
    if [ -n "${candidate}" ] && [ -S "/tmp/.X11-unix/X${candidate#:}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done < <(pgrep -af 'Xtigervnc|Xvnc' | grep -o ':[0-9]\+' | uniq || true)

  while IFS= read -r candidate; do
    if [ -n "${candidate}" ] && [ -S "/tmp/.X11-unix/X${candidate#:}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done < <(pgrep -af 'Xorg' | grep -o ':[0-9]\+' | uniq || true)

  if [ -S /tmp/.X11-unix/X1 ]; then
    printf ':1\n'
    return 0
  fi

  if [ -S /tmp/.X11-unix/X0 ]; then
    printf ':0\n'
    return 0
  fi

  printf ':1\n'
}

export DISPLAY="${DISPLAY:-$(detect_display)}"
export XAUTHORITY="${XAUTHORITY:-/root/.Xauthority}"
WATCHER_PROFILE_DIR="${WATCHER_PROFILE_DIR:-/root/.cache/zalo-watcher-chromium-profile}"
PROFILE_TEMPLATE_DIR="${PROFILE_TEMPLATE_DIR:-/root/snap/chromium/common/chromium}"

resolve_chromium_bin() {
  local candidate=""

  for candidate in \
    "${CHROMIUM_BIN:-}" \
    "/snap/chromium/current/usr/lib/chromium-browser/chrome" \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v chromium-browser 2>/dev/null || true)" \
    "/snap/bin/chromium" \
    "/usr/bin/chromium-browser"
  do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

CHROMIUM_BIN="$(resolve_chromium_bin || true)"

if [ -z "${CHROMIUM_BIN}" ]; then
  echo "Unable to locate a Chromium binary" >&2
  sleep 10
  exit 1
fi

mkdir -p "${WATCHER_PROFILE_DIR}"

if [ ! -d "${WATCHER_PROFILE_DIR}/Default" ] && [ -d "${PROFILE_TEMPLATE_DIR}/Default" ]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude 'Default/Cache' \
      --exclude 'Default/Code Cache' \
      --exclude 'Default/GPUCache' \
      --exclude 'Default/DawnGraphiteCache' \
      --exclude 'Default/DawnWebGPUCache' \
      --exclude 'Default/GrShaderCache' \
      --exclude 'Default/GraphiteDawnCache' \
      --exclude 'Default/Service Worker/CacheStorage' \
      --exclude 'ShaderCache' \
      --exclude 'GraphiteDawnCache' \
      --exclude 'GrShaderCache' \
      --exclude 'component_crx_cache' \
      --exclude 'DeferredBrowserMetrics' \
      --exclude 'BrowserMetrics' \
      "${PROFILE_TEMPLATE_DIR}/" "${WATCHER_PROFILE_DIR}/"
  else
    cp -a "${PROFILE_TEMPLATE_DIR}/." "${WATCHER_PROFILE_DIR}/"
    rm -rf \
      "${WATCHER_PROFILE_DIR}/Default/Cache" \
      "${WATCHER_PROFILE_DIR}/Default/Code Cache" \
      "${WATCHER_PROFILE_DIR}/Default/GPUCache" \
      "${WATCHER_PROFILE_DIR}/Default/DawnGraphiteCache" \
      "${WATCHER_PROFILE_DIR}/Default/DawnWebGPUCache" \
      "${WATCHER_PROFILE_DIR}/Default/GrShaderCache" \
      "${WATCHER_PROFILE_DIR}/Default/GraphiteDawnCache" \
      "${WATCHER_PROFILE_DIR}/Default/Service Worker/CacheStorage" \
      "${WATCHER_PROFILE_DIR}/ShaderCache" \
      "${WATCHER_PROFILE_DIR}/GraphiteDawnCache" \
      "${WATCHER_PROFILE_DIR}/GrShaderCache" \
      "${WATCHER_PROFILE_DIR}/component_crx_cache" \
      "${WATCHER_PROFILE_DIR}/DeferredBrowserMetrics" \
      "${WATCHER_PROFILE_DIR}/BrowserMetrics"
  fi
fi

rm -f \
  "${WATCHER_PROFILE_DIR}/SingletonLock" \
  "${WATCHER_PROFILE_DIR}/SingletonSocket" \
  "${WATCHER_PROFILE_DIR}/SingletonCookie"

for attempt in $(seq 1 20); do
  if "${CHROMIUM_BIN}" --version >/dev/null 2>&1; then
    break
  fi

  echo "Chromium binary unavailable, retrying (${attempt}/20): ${CHROMIUM_BIN}" >&2
  sleep 3
done

exec "${CHROMIUM_BIN}" \
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
  --user-data-dir="${WATCHER_PROFILE_DIR}" \
  --profile-directory=Default \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-infobars \
  https://chat.zalo.me/
