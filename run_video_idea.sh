#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f automation/.env ]]; then
  echo "[ERROR] automation/.env not found"
  echo "cp automation/.env.no-slack.example automation/.env"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: ./run_video_idea.sh \"your video idea\""
  exit 1
fi

IDEA="$*"

set -a
source automation/.env
set +a

python3 automation/video_pipeline_no_slack.py --idea "$IDEA"
