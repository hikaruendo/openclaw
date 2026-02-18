#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "[ERROR] .env not found. Copy from .env.example"
  exit 1
fi

source .env

python3 yta_collect.py --env-file .env "$@"
