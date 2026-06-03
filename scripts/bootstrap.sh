#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -m analytics.db init
python3 -m edge.ingest --sample
python3 -m pos.ingest --sample
python3 -m analytics.sync_inbox
python3 -m analytics.report --date today

echo ""
echo "Open docs: file://$(pwd)/docs/index.html"
echo "Dashboard: file://$(pwd)/dashboard/index.html"
