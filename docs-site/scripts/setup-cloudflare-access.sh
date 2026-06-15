#!/usr/bin/env bash
set -euo pipefail

# Applies Cloudflare Access to the docs site with a single-email allowlist.
#
# Uses reusable Zero Trust policies (duncan-only + whitelist-only) and the
# one-time PIN identity provider. Do NOT create separate Access apps for
# *.workers.dev hostnames — use Workers Settings > Enable Cloudflare Access instead.
#
# Required environment variables:
#   CLOUDFLARE_API_TOKEN  - API token with Zero Trust edit permissions
#   CLOUDFLARE_ACCOUNT_ID - Cloudflare account ID
#   DOCS_HOSTNAME         - Hostname serving the docs (e.g. listing-lens-docs.pages.dev)
#
# Optional:
#   ACCESS_APP_NAME       - Defaults to "Listing Lens Docs"
#   ACCESS_IDP_ID         - One-time PIN IdP (auto-detected if unset)
#   ACCESS_ALLOW_POLICY_ID - Reusable allow policy (auto-detected if unset)
#   ACCESS_DENY_POLICY_ID  - Reusable deny policy (auto-detected if unset)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/../infra/access-policy.json"
ALLOWED_EMAIL=$(jq -r '.allowed_identities[0].email' "${POLICY_FILE}")

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
: "${DOCS_HOSTNAME:?Set DOCS_HOSTNAME}"

ACCESS_APP_NAME="${ACCESS_APP_NAME:-Listing Lens Docs}"
API_BASE="https://api.cloudflare.com/client/v4"

auth_header=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

if [[ "${DOCS_HOSTNAME}" == *".workers.dev" ]]; then
  echo "ERROR: Do not apply self-hosted Access apps to workers.dev hostnames." >&2
  echo "Enable Access via Workers & Pages > Worker > Settings > Domains & Routes > Enable Cloudflare Access." >&2
  exit 1
fi

lookup_idp() {
  curl -sS "${auth_header[@]}" \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers" \
    | jq -r '.result[] | select(.type=="onetimepin") | .id' | head -1
}

lookup_policy() {
  local name="$1"
  curl -sS "${auth_header[@]}" \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/policies" \
    | jq -r --arg name "${name}" '.result[] | select(.name==$name) | .id' | head -1
}

IDP_ID="${ACCESS_IDP_ID:-$(lookup_idp)}"
ALLOW_ID="${ACCESS_ALLOW_POLICY_ID:-$(lookup_policy "duncan-only")}"
DENY_ID="${ACCESS_DENY_POLICY_ID:-$(lookup_policy "whitelist-only")}"

if [[ -z "${IDP_ID}" || -z "${ALLOW_ID}" || -z "${DENY_ID}" ]]; then
  echo "Missing IdP or reusable policies. Create onetimepin IdP and duncan-only/whitelist-only policies first." >&2
  exit 1
fi

existing_app_id=$(
  curl -sS "${auth_header[@]}" \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" \
    | jq -r --arg domain "${DOCS_HOSTNAME}" '.result[] | select(.domain == $domain) | .uid' \
    | head -1
)

app_payload=$(jq -n \
  --arg name "${ACCESS_APP_NAME}" \
  --arg domain "${DOCS_HOSTNAME}" \
  --arg idp "${IDP_ID}" \
  --arg allow "${ALLOW_ID}" \
  --arg deny "${DENY_ID}" \
  '{
    name: $name,
    type: "self_hosted",
    domain: $domain,
    session_duration: "24h",
    allowed_idps: [$idp],
    auto_redirect_to_identity: true,
    policies: [$allow, $deny]
  }')

if [[ -n "${existing_app_id}" ]]; then
  echo "Updating Cloudflare Access application for ${DOCS_HOSTNAME}..."
  app_response=$(curl -sS "${auth_header[@]}" \
    -X PUT "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${existing_app_id}" \
    -d "${app_payload}")
else
  echo "Creating Cloudflare Access application for ${DOCS_HOSTNAME}..."
  app_response=$(curl -sS "${auth_header[@]}" \
    -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" \
    -d "${app_payload}")
fi

app_success=$(echo "${app_response}" | jq -r '.success')
if [[ "${app_success}" != "true" ]]; then
  echo "Failed to configure Access application:" >&2
  echo "${app_response}" | jq . >&2
  exit 1
fi

app_id=$(echo "${app_response}" | jq -r '.result.uid')
aud=$(echo "${app_response}" | jq -r '.result.aud')
auth_domain=$(curl -sS "${auth_header[@]}" \
  "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/organizations" \
  | jq -r '.result.auth_domain')

echo "Access application configured: ${app_id}"
echo "Protected hostname: ${DOCS_HOSTNAME}"
echo "Whitelisted email: ${ALLOWED_EMAIL}"
echo "Login URL: https://${auth_domain}/cdn-cgi/access/login/${aud}"
