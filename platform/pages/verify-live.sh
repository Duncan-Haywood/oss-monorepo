#!/usr/bin/env bash
# Checks that a freshly deployed copy of the site answers at its public URL.
# Used by both deploy jobs in .github/workflows/portfolio-pages.yml.
#
#   bash platform/pages/verify-live.sh <base-url>
#
# A completed deploy step is not evidence that anything serves. Check
# the front page, both sitemaps, robots, and one product through the
# real public URL, so "deployed" is a fact rather than an inference.
#
# The product page is named by the live catalog rather than hardcoded:
# a hardcoded slug stops proving anything the moment that venture is
# renamed, and the loop below would then have reported a 404 as the
# site's fault instead of the check's. Reading the slug back off the
# origin also proves catalog.json is the same one this build wrote.

PAGE_URL="${1:?usage: verify-live.sh <base-url>}"
set -euo pipefail
base="${PAGE_URL%/}"
# Outside Actions (a local run, verify-live.test.mjs) there is no RUNNER_TEMP.
RUNNER_TEMP="${RUNNER_TEMP:-$(mktemp -d)}"

# The product page to exercise comes from the live catalog rather than
# a literal slug: a renamed or retired venture would otherwise make
# this step fail for the wrong reason, or -- worse, once someone
# "fixes" it by deleting the line -- pass without touching a tool at
# all. Pages can also serve the previous revision for a few seconds
# after the deployment API reports success, hence the retries.
curl --fail --silent --show-error --retry 5 --retry-delay 10 \
     --retry-all-errors "${base}/catalog.json" -o "$RUNNER_TEMP/catalog.json"
# jq, not python3: this job has no setup-python step, and a self-hosted
# runner image may ship jq but no interpreter -- ubuntu-latest happening
# to have python3 available would mask that.
tools=$(jq '.tools | length' "$RUNNER_TEMP/catalog.json")
echo "Catalog lists ${tools} tool(s)"
[ "$tools" -ge 20 ] || { echo "::error::catalog.json lists only ${tools} tools"; exit 1; }
slug=$(jq -r '.tools[0].slug' "$RUNNER_TEMP/catalog.json")

for path in "/" "/research/" "/writing/" "/sitemap.xml" "/sitemap-hub.xml" "/robots.txt" "/catalog.json" "/llms.txt" "/llms-full.txt" "/feed.xml" "/${slug}/"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 5 \
           --retry-all-errors "${base}${path}")
  echo "${code}  ${base}${path}"
  [ "$code" = "200" ] || { echo "::error::${base}${path} returned ${code}"; exit 1; }
done
if ! { curl -sS "${base}/sitemap.xml" -o "$RUNNER_TEMP/sitemap.xml" && grep -q "<sitemapindex" "$RUNNER_TEMP/sitemap.xml"; }; then
  echo "::error::sitemap.xml served without a sitemap index"; exit 1
fi
# A 200 on llms.txt is not enough: Pages would serve an empty file
# just as happily, and an assistant reading it would find no tools.
if ! { curl -sS "${base}/llms.txt" -o "$RUNNER_TEMP/llms.txt" && grep -q "^- \[" "$RUNNER_TEMP/llms.txt"; }; then
  echo "::error::llms.txt served without any tool entries"; exit 1
fi
# Same argument for the feed, and one more: a feed that serves 200
# with zero entries is indistinguishable from a healthy one to every
# subscriber, who simply never hears about a new tool again.
if ! { curl -sS "${base}/feed.xml" -o "$RUNNER_TEMP/feed.xml" && grep -q "<entry>" "$RUNNER_TEMP/feed.xml"; }; then
  echo "::error::feed.xml served without any entries"; exit 1
fi
# Every check above passes just as well on the copy that was live before
# this deploy: a wrangler deploy that uploaded nothing new, or a CDN still
# serving the old revision, would read as "published". The build writes
# version.json with the commit it was built from (build.mjs, buildVersion),
# and redirect-stubs.mjs copies JSON unchanged, so on both hosts the file
# must name this run's commit. The query string keeps a CDN cache (GitHub
# Pages) from answering with the previous copy.
# (quality audit 2026-11-10, portfolio/quality/audits/2026-11-10-cloudflare.json)
if [ -n "${GITHUB_SHA:-}" ]; then
  tries="${VERIFY_SHA_TRIES:-12}"
  delay="${VERIFY_SHA_DELAY:-10}"
  live=""
  for i in $(seq 1 "$tries"); do
    live=$(curl -sS --fail "${base}/version.json?v=${GITHUB_SHA}" 2>/dev/null | jq -r '.sha // empty' 2>/dev/null || true)
    [ "$live" = "$GITHUB_SHA" ] && break
    [ "$i" -lt "$tries" ] && sleep "$delay"
  done
  if [ "$live" != "$GITHUB_SHA" ]; then
    echo "::error::${base}/version.json names commit '${live:-none}', not this run's ${GITHUB_SHA}: the deploy did not publish this build"
    exit 1
  fi
  echo "version.json names this run's commit ${GITHUB_SHA}"
fi
echo "Published and verified: ${base}/ (product page /${slug}/)"
