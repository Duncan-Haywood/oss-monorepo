#!/bin/sh
# Make a standalone folder that watches one metric from your own GitHub repository:
#   sh deploy/make-watch-repo.sh ../my-metric-watch
#   cd ../my-metric-watch && git init && git add . && git commit -m "watch a metric" && git push ...
# Without a clone of the repository (about 5 GB), the same script fetches the files it needs:
#   curl -fsSL https://raw.githubusercontent.com/Duncan-Haywood/oss-monorepo/main/ventures/changepoint-detector/deploy/make-watch-repo.sh | sh -s -- my-metric-watch
# It copies the engine and watch.mjs (zero dependencies, MIT) and the scheduled workflow. Nothing
# here talks to us after that: the runs, the data and the webhook stay in your account.
set -eu
DEST=${1:?usage: sh deploy/make-watch-repo.sh <new-folder>}
BASE=${CPD_SOURCE:-https://raw.githubusercontent.com/Duncan-Haywood/oss-monorepo/main/ventures/changepoint-detector}
SRC=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo /nonexistent)
get() { # get <path in the venture> <destination>
  if [ -f "$SRC/watch.mjs" ] && [ -f "$SRC/$1" ]; then cp "$SRC/$1" "$2"; else curl -fsSL "$BASE/$1" -o "$2"; fi
}
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then echo "$DEST exists and is not empty" >&2; exit 1; fi
mkdir -p "$DEST/.github/workflows" "$DEST/data"
for f in watch.mjs watch-core.mjs engine.mjs example-data.mjs slope-breaks.mjs hinge-test.mjs ramps.mjs drift-level.mjs update-rate.mjs LICENSE; do get "$f" "$DEST/$f"; done
get deploy/watch-metric.yml "$DEST/.github/workflows/watch-metric.yml"

printf '{ "type": "module" }\n' > "$DEST/package.json"
cat > "$DEST/README.md" <<'MD'
# Metric watch

Checks a metric once a day and tells you when its level has changed: a lasting shift, not one odd
day. Made with the free [Changepoint Detector](https://marisstella.app/changepoint-detector/)
(PELT, Killick et al. 2012), MIT licence.

1. Put your series in `data/metric.csv` (a date column and a value column, oldest first), or keep a
   link to a CSV that some other job updates.
2. In this repository's Settings > Secrets and variables > Actions, add the variable `METRIC_CSV`
   (`data/metric.csv` or the link) and, if you want chat alerts, the secret `WATCH_WEBHOOK_URL`.
3. Actions > watch-metric > Run workflow. The first run records the changes already in the history
   as the baseline; later runs report each new change once, after 5 points on its far side.

Try it locally: `node watch.mjs data/metric.csv --state watch-state.json` (Node 18+). `node watch.mjs --help`
lists the options (counts, volatility, a weekly cycle, logs).

How eager to be: `node watch.mjs data/metric.csv --suggest --alerts-per 1/month` replays your history once per
setting and suggests the most eager one that would have stayed within about one alert a month. To have the
first run pick it and later runs keep it, set `WATCH_OPTIONS` to `--detector auto --alerts-per 1/month`.

Statistical analysis of data you supply, not advice. If this saves you time, you can support the
creator: https://github.com/sponsors/Duncan-Haywood
MD
echo "date,value" > "$DEST/data/metric.csv"
echo "Made $DEST. Add your rows to $DEST/data/metric.csv, push it to a new GitHub repository, then set METRIC_CSV (see its README)."
