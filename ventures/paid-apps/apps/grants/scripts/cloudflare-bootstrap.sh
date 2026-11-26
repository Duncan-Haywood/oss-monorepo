#!/usr/bin/env bash
# One-time Cloudflare setup for the grants-deploy workflow. Run it on YOUR machine (not in CI):
#
#   bash apps/grants/scripts/cloudflare-bootstrap.sh
#
# It asks for your Cloudflare login email and Global API Key (dash.cloudflare.com -> My Profile ->
# API Tokens -> Global API Key -> View), then:
#   1. creates a scoped API token "grant-autopilot-deploy" with only the permissions the deploy needs,
#   2. stores it (never printed) plus your account id as GitHub repository secrets,
#   3. sets the APP_DOMAIN repository variable.
# The Global API Key is only used for these calls and is not saved anywhere.
#
# Needs: curl, jq, and the GitHub CLI (gh) logged in with access to the repository.
# Options (env): REPO (default Duncan-Haywood/private-monorepo), ZONE (default marisstella.app),
#   APP_DOMAIN (default grants.<ZONE>), TOKEN_NAME (default grant-autopilot-deploy),
#   CF_ACCOUNT_ID (skip the account picker), DRY_RUN=1 (create nothing, show the plan).
set -euo pipefail

REPO="${REPO:-Duncan-Haywood/private-monorepo}"
ZONE="${ZONE:-marisstella.app}"
APP_DOMAIN="${APP_DOMAIN:-grants.$ZONE}"
TOKEN_NAME="${TOKEN_NAME:-grant-autopilot-deploy}"
API="https://api.cloudflare.com/client/v4"

# Cloudflare permission group names ("Edit" in the dashboard is "Write" in the API).
ACCOUNT_PERMS=(
  "Workers Scripts Write"    # deploy the Worker, Workflow, rate-limit bindings, cron triggers
  "D1 Write"                 # database + migrations
  "Workers R2 Storage Write" # file storage
  "Queues Write"             # background jobs + dead-letter queue
  "Vectorize Write"          # search index
  "Workers AI Read"          # embeddings / transcription binding
  "Account Settings Read"    # wrangler account lookup
  "Workers Tail Read"        # live logs (wrangler tail)
)
ZONE_PERMS=(
  "Zone Read"            # find the zone for the custom domain
  "DNS Write"            # custom domain DNS record
  "Workers Routes Write" # attach the Worker to grants.<zone>
)

for bin in curl jq gh; do
  command -v "$bin" >/dev/null || { echo "Missing '$bin'. Install it and run again." >&2; exit 1; }
done
if [[ "${DRY_RUN:-0}" != "1" ]]; then
  gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }
fi

read -r -p "Cloudflare login email: " CF_EMAIL
read -r -s -p "Cloudflare Global API Key (input hidden): " CF_KEY
echo

cf() { # cf METHOD PATH [JSON]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "$API$path" -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_KEY"
    -H "Content-Type: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")
  local out
  out="$(curl "${args[@]}")"
  if [[ "$(jq -r '.success' <<<"$out")" != "true" ]]; then
    echo "Cloudflare API error on $method $path:" >&2
    jq -r '.errors[]? | "  \(.code): \(.message)"' <<<"$out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

# Account
if [[ -z "${CF_ACCOUNT_ID:-}" ]]; then
  accounts="$(cf GET "/accounts?per_page=50")"
  count="$(jq '.result | length' <<<"$accounts")"
  if [[ "$count" == "1" ]]; then
    CF_ACCOUNT_ID="$(jq -r '.result[0].id' <<<"$accounts")"
  else
    echo "Accounts:"
    jq -r '.result | to_entries[] | "  \(.key + 1)) \(.value.name)  (\(.value.id))"' <<<"$accounts"
    read -r -p "Pick an account number: " n
    CF_ACCOUNT_ID="$(jq -r --argjson i "$((n - 1))" '.result[$i].id' <<<"$accounts")"
  fi
fi
echo "Account: $CF_ACCOUNT_ID"

# Zone
zones="$(cf GET "/zones?name=$ZONE&account.id=$CF_ACCOUNT_ID")"
ZONE_ID="$(jq -r '.result[0].id // empty' <<<"$zones")"
if [[ -z "$ZONE_ID" ]]; then
  echo "Zone '$ZONE' was not found in this account. Add the domain to Cloudflare first (or set ZONE=...)." >&2
  exit 1
fi
echo "Zone: $ZONE ($ZONE_ID)"

# Permission groups -> ids
groups="$(cf GET "/user/tokens/permission_groups")"
ids_for() { # ids_for NAME... -> JSON array of {id}
  local missing=() json="[]" name id
  for name in "$@"; do
    id="$(jq -r --arg n "$name" '[.result[] | select((.name | ascii_downcase) == ($n | ascii_downcase))][0].id // empty' <<<"$groups")"
    if [[ -z "$id" ]]; then missing+=("$name"); continue; fi
    json="$(jq -c --arg id "$id" '. + [{id: $id}]' <<<"$json")"
  done
  if ((${#missing[@]})); then
    echo "These permission groups were not found: ${missing[*]}" >&2
    echo "Similar names Cloudflare offers:" >&2
    for name in "${missing[@]}"; do
      jq -r --arg w "${name%% *}" '.result[].name | select(ascii_downcase | contains($w | ascii_downcase))' <<<"$groups" | sort -u | sed 's/^/  /' >&2
    done
    exit 1
  fi
  printf '%s' "$json"
}
ACCOUNT_GROUPS="$(ids_for "${ACCOUNT_PERMS[@]}")"
ZONE_GROUPS="$(ids_for "${ZONE_PERMS[@]}")"

payload="$(jq -n \
  --arg name "$TOKEN_NAME" \
  --arg acct "com.cloudflare.api.account.$CF_ACCOUNT_ID" \
  --arg zone "com.cloudflare.api.account.zone.$ZONE_ID" \
  --argjson ag "$ACCOUNT_GROUPS" \
  --argjson zg "$ZONE_GROUPS" \
  '{name: $name, policies: [
     {effect: "allow", resources: {($acct): "*"}, permission_groups: $ag},
     {effect: "allow", resources: {($zone): "*"}, permission_groups: $zg}
   ]}')"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN: would create this token and set secrets on $REPO:"
  jq . <<<"$payload"
  exit 0
fi

created="$(cf POST "/user/tokens" "$payload")"
TOKEN="$(jq -r '.result.value' <<<"$created")"
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { echo "Token creation returned no value." >&2; exit 1; }

# Verify the new token works before storing it.
verify="$(curl -sS "$API/user/tokens/verify" -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.result.status // empty' <<<"$verify")" == "active" ]] || {
  echo "The new token did not verify as active." >&2
  exit 1
}

printf '%s' "$TOKEN" | gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO"
printf '%s' "$CF_ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO"
gh variable set APP_DOMAIN --repo "$REPO" --body "$APP_DOMAIN"
unset TOKEN CF_KEY

echo
echo "Done. Created token '$TOKEN_NAME' and set on $REPO:"
echo "  secrets:  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID"
echo "  variable: APP_DOMAIN=$APP_DOMAIN"
echo "Make sure the account is on the Workers Paid plan (Queues and Workflows need it)."
