#!/usr/bin/env bash
set -euo pipefail

# Proves, from outside, that Cloudflare Access is actually gating the docs
# hostname — by asking for the site with no credentials and failing if the
# content comes back.
#
# This exists because configuring the gate and having the gate be on turned out
# to be different things. setup-cloudflare-access.sh was correct, but the
# workflow only ran it on workflow_dispatch, so every push-triggered deploy
# published the site with no Access application in front of it. Meanwhile the
# site itself rendered a padlock and the words "Private — Cloudflare Access" on
# every page. Nothing ever checked, so an unauthenticated GET returned 200 and
# the full contents — including the internal outreach templates and the
# booking/leads process — for as long as that was true.
#
# A successful API response from the setup script is not evidence. This is.
#
# Required:
#   DOCS_HOSTNAME - hostname serving the docs (e.g. listing-lens-docs.pages.dev)
#
# Optional:
#   ACCESS_VERIFY_ATTEMPTS - polls before giving up (default 6)
#   ACCESS_VERIFY_DELAY    - seconds between polls (default 10)
#   ACCESS_VERIFY_URL      - probe target override. Exists so the pass paths can
#                            be exercised against a local stub in
#                            verify-access-gate.test.sh; a check that has only
#                            ever been seen to fail is not a proven check, and
#                            this one gates every deploy.

: "${DOCS_HOSTNAME:?Set DOCS_HOSTNAME}"

ATTEMPTS="${ACCESS_VERIFY_ATTEMPTS:-6}"
DELAY="${ACCESS_VERIFY_DELAY:-10}"

# A string that appears on the real docs site and nowhere on an Access login
# interstitial. If this comes back, we were served the content.
CONTENT_MARKER="Listing Lens"

url="${ACCESS_VERIFY_URL:-https://${DOCS_HOSTNAME}/}"

echo "Verifying Cloudflare Access is gating ${url} (unauthenticated request)..."

for attempt in $(seq 1 "${ATTEMPTS}"); do
  # Deliberately do NOT follow redirects: an Access-protected origin answers
  # an unauthenticated request with a redirect to the login domain, and we
  # want to see that redirect rather than its destination.
  status=$(curl -sS -o /tmp/access-probe-body -w '%{http_code}' \
    --max-time 30 "${url}" || echo "000")
  location=$(curl -sSI --max-time 30 "${url}" 2>/dev/null \
    | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}' | head -1 || true)

  body_has_content=false
  if grep -q "${CONTENT_MARKER}" /tmp/access-probe-body 2>/dev/null; then
    body_has_content=true
  fi

  if [[ "${status}" == "302" || "${status}" == "303" || "${status}" == "307" ]] \
    && [[ "${location}" == *"cloudflareaccess.com"* ]]; then
    echo "PASS: unauthenticated request redirected to Access login (${location})"
    exit 0
  fi

  if [[ "${status}" == "403" && "${body_has_content}" == false ]]; then
    echo "PASS: unauthenticated request denied with 403 and no site content"
    exit 0
  fi

  if [[ "${status}" == "200" && "${body_has_content}" == true ]]; then
    # No point retrying: the site is being served to anonymous callers.
    echo "FAIL: ${url} returned 200 with site content to an unauthenticated request." >&2
    echo "" >&2
    echo "Cloudflare Access is NOT gating this hostname. The site claims it is —" >&2
    echo "docs-site/src/components/DocsShell.tsx and src/app/page.tsx both render" >&2
    echo "a padlock and the words 'Cloudflare Access'. That claim is false while" >&2
    echo "this check fails, and the internal outreach templates, leads process and" >&2
    echo "booking details on /pricing/ are readable by anyone with the URL." >&2
    echo "" >&2
    echo "Fix: ensure setup-cloudflare-access.sh ran successfully for this" >&2
    echo "hostname (it needs CLOUDFLARE_API_TOKEN with Zero Trust edit rights)," >&2
    echo "then re-run this check." >&2
    exit 1
  fi

  echo "  attempt ${attempt}/${ATTEMPTS}: status=${status} location=${location:-none} — retrying in ${DELAY}s"
  sleep "${DELAY}"
done

echo "FAIL: could not confirm an Access gate on ${url} after ${ATTEMPTS} attempts." >&2
echo "Last status=${status}. Failing closed: an unverified gate is treated as no gate." >&2
exit 1
