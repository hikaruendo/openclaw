#!/usr/bin/env bash
set -euo pipefail
cd /Users/hikaruendo/Projects/openclaw
mkdir -p automation/dropshipping/logs

MODE="${ADAPTER_MODE:-mock}"

while true; do
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  {
    echo "===== ${ts} (mode=${MODE}) ====="
    node automation/dropshipping/scripts/supplier-crawl.mjs
    ADAPTER_MODE="${MODE}" node automation/dropshipping/run-pipeline.mjs
    node automation/dropshipping/scripts/summary.mjs
    echo
  } >> automation/dropshipping/logs/ops-loop-$(date +%Y%m%d).log 2>&1

  sleep "${LOOP_SECONDS:-1800}"
done
