#!/usr/bin/env bash
set -euo pipefail

# Applies Cloudflare Access to the docs site with a single-email allowlist.
#
# Required environment variables:
#   CLOUDFLARE_API_TOKEN  - API token with Zero Trust edit permissions
#   CLOUDFLARE_ACCOUNT_ID - Cloudflare account ID
#   DOCS_HOSTNAME         - Hostname serving the docs (e.g. listing-lens-docs.pages.dev)
#
# Optional:
#   ACCESS_APP_NAME       - Defaults to "Listing Lens Docs"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/../infra/access-policy.json"

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
: "${DOCS_HOSTNAME:?Set DOCS_HOSTNAME (e.g. listing-lens-docs.pages.dev)}"

ACCESS_APP_NAME="${ACCESS_APP_NAME:-Listing Lens Docs}"
API_BASE="https://api.cloudflare.com/client/v4"

auth_header=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

echo "Creating Cloudflare Access application for ${DOCS_HOSTNAME}..."

app_payload=$(jq -n \
  --arg name "${ACCESS_APP_NAME}" \
  --arg domain "${DOCS_HOSTNAME}" \
  '{name: $name, type: "self_hosted", domain: $domain, session_duration: "24h"}')

app_response=$(curl -sS "${auth_header[@]}" \
  -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" \
  -d "${app_payload}")

app_success=$(echo "${app_response}" | jq -r '.success')
if [[ "${app_success}" != "true" ]]; then
  echo "Failed to create Access application:" >&2
  echo "${app_response}" | jq . >&2
  exit 1
fi

app_id=$(echo "${app_response}" | jq -r '.result.uid')
echo "Access application created: ${app_id}"

policy_name=$(jq -r '.policy.name' "${POLICY_FILE}")
policy_decision=$(jq -r '.policy.decision' "${POLICY_FILE}")
policy_include=$(jq -c '.policy.include' "${POLICY_FILE}")

policy_payload=$(jq -n \
  --arg name "${policy_name}" \
  --arg decision "${policy_decision}" \
  --argjson include "${policy_include}" \
  '{name: $name, decision: $decision, include: $include}')

policy_response=$(curl -sS "${auth_header[@]}" \
  -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${app_id}/policies" \
  -d "${policy_payload}")

policy_success=$(echo "${policy_response}" | jq -r '.success')
if [[ "${policy_success}" != "true" ]]; then
  echo "Failed to create Access policy:" >&2
  echo "${policy_response}" | jq . >&2
  exit 1
fi

echo "Access policy applied. Only whitelisted emails can reach ${DOCS_HOSTNAME}."
echo "Whitelisted email: duncan.andrew.haywood@gmail.com"
