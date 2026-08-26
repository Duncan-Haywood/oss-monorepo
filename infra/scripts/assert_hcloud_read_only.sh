#!/usr/bin/env bash
# Refuse a Hetzner token that can create billable resources.
#
# Hetzner Cloud has no hard euro spend cap. Usage alerts are email-only
# and do not stop API creates, resizes, or volumes
# (https://docs.hetzner.com/cloud/billing/faq/). A Read+Write token in
# CI or an agent is therefore unbounded spend. A Read token is not.
#
# Probe: POST /servers with an empty body. That payload can never create
# a server (required fields missing). 403 means the token cannot write.
# Any other success-adjacent code means it can, or the API changed — fail
# closed either way.
set -euo pipefail

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  echo "HCLOUD_TOKEN is unset — nothing to assert" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

code="$(curl -sS -o "$tmp" -w '%{http_code}' \
  --connect-timeout 10 --max-time 20 \
  -X POST 'https://api.hetzner.cloud/v1/servers' \
  -H "Authorization: Bearer ${HCLOUD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}')"

case "$code" in
  403)
    echo "HCLOUD_TOKEN is Read-only (POST /servers -> 403). Safe for plan/discover."
    exit 0
    ;;
  401)
    echo "HCLOUD_TOKEN was rejected (401). Rotate it." >&2
    exit 1
    ;;
  *)
    echo "HCLOUD_TOKEN looks write-capable or unexpected (POST /servers -> ${code})." >&2
    echo "Hetzner will not stop this token from creating servers. Do not store it in CI." >&2
    echo "Console: project -> Security -> API tokens -> New token -> Read." >&2
    head -c 400 "$tmp" >&2 || true
    echo >&2
    exit 2
    ;;
esac
