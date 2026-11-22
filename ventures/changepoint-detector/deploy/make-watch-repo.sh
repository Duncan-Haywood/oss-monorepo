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
for f in watch.mjs watch-core.mjs engine.mjs presteps.mjs segmentation.mjs garch.mjs stats-core.mjs parse-series.mjs bocpd.mjs example-data.mjs slope-breaks.mjs hinge-test.mjs two-hinge.mjs known-date.mjs ramps.mjs drift-level.mjs update-rate.mjs rounded-walk.mjs multivariate.mjs consensus.mjs stripe-metrics.mjs shopify-metrics.mjs search-console-metrics.mjs ga4-metrics.mjs LICENSE; do get "$f" "$DEST/$f"; done
get deploy/watch-metric.yml "$DEST/.github/workflows/watch-metric.yml"

printf '{ "type": "module" }\n' > "$DEST/package.json"
printf '# Stripe, Shopify, Search Console and Analytics metrics are fetched each run (and cached by the workflow); never commit them.\ndata/stripe.csv*\ndata/shopify.csv\ndata/gsc.csv\ndata/ga4.csv\n' > "$DEST/.gitignore"
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

Several metrics in one sheet (orders, revenue, sign-ups as columns): add `--columns all`, or name them with a model
each, `--columns orders:poisson,revenue,signups:poisson`, to `WATCH_OPTIONS`. Each column keeps its own record in
`watch-state.json`, the day's new changes arrive as one message, and `--detector auto --alerts-per` picks each
column's setting against the budget on its own history. A column can name its own detector after its model, and a
count column a clumping cost after that. A count column that names neither runs the windowed pass with a cost for
bunched counts at alert threshold 0.3: on 2,200 fresh simulated shops it sent 1.03 false alerts per 1,000 days
against the older default's 3.26 and heard 1,056 of 1,200 drops and rises against 701 (README "A count default for
clumped orders"). `--columns orders:poisson:bocpd,revenue` keeps the older default. Revenue keeps its default.

Stripe: add the secret `STRIPE_API_KEY` (a restricted key with read access to Charges; Dashboard > Developers >
API keys > Create restricted key) and leave `METRIC_CSV` unset. Each run then fetches your complete days into
`data/stripe.csv` (payments, revenue, failed payments; `node stripe-metrics.mjs --help`) and watches all three, so
you hear when sales, revenue or card declines move to a new level. Keep this repository private: `watch-state.json`
records your revenue around each change. `data/stripe.csv` is cached by the workflow, never committed.

Shopify: create a custom app in your store (Shopify admin > Settings > Apps and sales channels > Develop apps;
Admin API scope `read_orders`, plus `read_all_orders` for more than 60 days of history), install it, and add its
Admin API access token as the secret `SHOPIFY_ACCESS_TOKEN` and your store name (`my-store` or
`my-store.myshopify.com`) as the variable `SHOPIFY_SHOP`. With `METRIC_CSV` unset and no Stripe key, each run fetches
your complete days into `data/shopify.csv` (orders, revenue, cancelled orders; `node shopify-metrics.mjs --help`) and
watches all three. Keep this repository private; `data/shopify.csv` is cached, never committed.

Google Search Console: in a Google Cloud project, enable the Search Console API and create a service account with a
JSON key; in Search Console add the service account's email as a Restricted user of your property. Add the whole key
file as the secret `GSC_SERVICE_ACCOUNT_JSON` and the property as the variable `GSC_SITE` (`sc-domain:example.com`, or
the URL prefix with its trailing slash). With `METRIC_CSV` unset and no Stripe or Shopify credentials, each run fetches
your finished days into `data/gsc.csv` (clicks, impressions, CTR, position; `node search-console-metrics.mjs --help`)
and watches clicks and impressions, so a lasting fall in search traffic reaches you within about a week, not at the
end of the month. `data/gsc.csv` is cached, never committed.

Google Analytics 4: enable the Google Analytics Data API in a Google Cloud project, create a service account with a
JSON key and add its email as a Viewer of the property (Admin > Property access management). Add the key file as the
secret `GA4_SERVICE_ACCOUNT_JSON` and the numeric property ID as the variable `GA4_PROPERTY`. With no other source
set, each run fetches `data/ga4.csv` (`node ga4-metrics.mjs --help`) and watches sessions, users and key events.
`data/ga4.csv` is cached, never committed.

Statistical analysis of data you supply, not advice. If this saves you time, you can support the
creator: https://github.com/sponsors/Duncan-Haywood
MD
echo "date,value" > "$DEST/data/metric.csv"
echo "Made $DEST. Add your rows to $DEST/data/metric.csv, push it to a new GitHub repository, then set METRIC_CSV (see its README)."
