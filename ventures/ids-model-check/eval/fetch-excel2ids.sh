#!/bin/sh
# Fetches buildingSMART-community's Excel2IDS (GPL-3.0; not committed here)
# at the commit eval/excel2ids-2026-11-19.md read: its sample workbook is the
# input for `node cli.mjs --from-sheet eval/corpus/Excel2IDS/Excel2IDS.xlsx -o x.ids`,
# and its tool (not run there) the one to compare with.
set -e
cd "$(dirname "$0")"
COMMIT=${EXCEL2IDS_COMMIT:-4eb7575}
if [ ! -d corpus/Excel2IDS ]; then git clone -q https://github.com/buildingsmart-community/Excel2IDS.git corpus/Excel2IDS; fi
(cd corpus/Excel2IDS && git checkout -q "$COMMIT")
echo "Excel2IDS at $(cd corpus/Excel2IDS && git rev-parse --short HEAD)"
