#!/usr/bin/env bash
set -euo pipefail

cd /root/apps/zalo-keyword-filter

INTERVAL_SECONDS="${ZALO_RUNTIME_HEALTHCHECK_INTERVAL_SECONDS:-45}"

while true; do
  scripts/zalo-runtime-healthcheck.sh || true
  sleep "${INTERVAL_SECONDS}"
done
