#!/usr/bin/env bash
set -euo pipefail
cd /Users/hikaruendo/Projects/openclaw
mkdir -p automation/dropshipping/logs

while true; do
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  {
    echo "===== ${ts} ====="
    ADAPTER_MODE=mock node automation/dropshipping/run-pipeline.mjs
    node automation/dropshipping/scripts/summary.mjs
    echo
  } >> automation/dropshipping/logs/mock-loop-$(date +%Y%m%d).log 2>&1

  sleep "${LOOP_SECONDS:-1800}"
done
