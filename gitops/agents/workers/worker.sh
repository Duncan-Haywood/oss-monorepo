#!/usr/bin/env bash
# Codex worker. Runs inside a Job on the tainted cpx22.
# Never pushes to the base branch. Never merges. Never talks to kube-apiserver.
set -euo pipefail

LIMIT_EXIT="${CODEX_LIMIT_EXIT:-42}"
AUTH_EXIT="${CODEX_AUTH_EXIT:-43}"
: "${QUEUE_ITEM_JSON:?QUEUE_ITEM_JSON is required}"

export PATH="/usr/local/bin:$HOME/.npm-global/bin:$PATH"
export npm_config_prefix="$HOME/.npm-global"
mkdir -p "$HOME/.npm-global"

MANDATE_FILE="${CODEX_MANDATE_FILE:-/opt/worker/mandate.md}"

# Where the Codex credential lives between Jobs. The governor mounts a PVC
# here; if it is missing or read-only we fall back to a throwaway directory
# and the run still works, it just cannot persist a refreshed token.
CODEX_STATE_DIR="${CODEX_STATE_DIR:-/var/lib/codex}"
if ! mkdir -p "$CODEX_STATE_DIR" 2>/dev/null || [[ ! -w "$CODEX_STATE_DIR" ]]; then
  CODEX_STATE_DIR="$(mktemp -d)"
  echo "worker: no writable credential volume — using $CODEX_STATE_DIR for this run only" >&2
fi
export CODEX_HOME="$CODEX_STATE_DIR/home"
mkdir -p "$CODEX_HOME"
chmod 700 "$CODEX_STATE_DIR" "$CODEX_HOME" 2>/dev/null || true

# Detect typical limit language from a command's combined output.
hit_limit() {
  local text="$1"
  grep -Eiq '429|rate.?limit|usage.?limit|exceeded.*quota|hit your (usage )?limit|limit reached|insufficient_quota|spend_limit_exceeded|organization_spend_limit_exceeded|project_spend_limit_exceeded' <<<"$text"
}

# An expired or rotated credential is not a quota problem: backing off for an
# hour would not fix it, and re-running every tick would burn the queue. Tell
# the two apart so the operator sees which one they have.
hit_auth_failure() {
  local text="$1"
  grep -Eiq '401|unauthorized|invalid_(api_key|token|grant|client)|not logged in|please (run )?.?codex login|authentication (failed|error)|refresh token' <<<"$text"
}

install_tools() {
  if ! command -v gh >/dev/null 2>&1; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg status=none
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
    apt-get update -qq
    apt-get install -y -qq gh git ca-certificates
  fi
  if ! command -v codex >/dev/null 2>&1; then
    npm install -g "@openai/codex@${CODEX_VERSION:-latest}"
  fi
}

# ---------------------------------------------------------------------------
# Authentication
#
# Either credential works; the owner decides which by choosing what to seal
# into `codex-secrets`, and both remain inert until the governor is enabled.
#
#   CODEX_AUTH_JSON  a whole ~/.codex/auth.json from `codex login`. Draws on a
#                    ChatGPT plan's included usage, so a tick costs nothing
#                    extra. This is the "built-in quota" shape.
#   OPENAI_API_KEY   metered project key under a separate org with a hard
#                    dollar cap — the path infra/OWNER_CHECKLIST.md describes.
#
# When both are sealed the subscription wins, because it is the one that does
# not bill; the mode is logged either way so a run is never ambiguous about
# whose budget it just spent.
#
# The subscription credential has to be written to disk: the Codex CLI reads
# `auth.json` from $CODEX_HOME and has no environment variable for a plan
# token. The old `CODEX_ACCESS_TOKEN` check here only proved a variable was
# set — nothing ever handed it to the CLI, so a subscription-only Secret
# failed at the first call.
# ---------------------------------------------------------------------------
AUTH_FILE="$CODEX_HOME/auth.json"
SEED_FINGERPRINT="$CODEX_STATE_DIR/.seed-sha256"
AUTH_MODE=""

configure_auth() {
  printf '%s\n' 'cli_auth_credentials_store = "file"' > "$CODEX_HOME/config.toml"

  if [[ -n "${CODEX_AUTH_JSON:-}" ]]; then
    local seeded persisted
    seeded="$(printf '%s' "$CODEX_AUTH_JSON" | sha256sum | cut -d' ' -f1)"
    persisted="$(cat "$SEED_FINGERPRINT" 2>/dev/null || true)"

    # Re-seed when the sealed Secret changed (the owner re-ran `codex login`)
    # or when nothing is persisted yet. Otherwise keep the file on the volume:
    # it holds the refresh the last Job performed, and overwriting it with an
    # already-rotated seed is how this wedges permanently.
    if [[ "$seeded" != "$persisted" || ! -s "$AUTH_FILE" ]]; then
      printf '%s' "$CODEX_AUTH_JSON" > "$AUTH_FILE"
      printf '%s' "$seeded" > "$SEED_FINGERPRINT"
      echo "worker: seeded $AUTH_FILE from \$CODEX_AUTH_JSON"
    else
      echo "worker: reusing the persisted Codex credential (seed unchanged)"
    fi
    chmod 600 "$AUTH_FILE"
    AUTH_MODE="subscription"
    return 0
  fi

  if [[ -s "$AUTH_FILE" ]]; then
    chmod 600 "$AUTH_FILE"
    echo "worker: using the persisted Codex credential (no \$CODEX_AUTH_JSON in the Secret)"
    AUTH_MODE="subscription"
    return 0
  fi

  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    echo "worker: authenticating with the metered OPENAI_API_KEY — this run bills per token"
    AUTH_MODE="api-key"
    return 0
  fi

  cat >&2 <<'MSG'
worker: no Codex credential is mounted — refusing to start.

Seal either CODEX_AUTH_JSON (contents of ~/.codex/auth.json after `codex
login`) or OPENAI_API_KEY into the `codex-secrets` Secret — see
gitops/agents/secrets/README.md.

CODEX_ACCESS_TOKEN on its own is not usable: the CLI reads a whole auth.json,
not a bare access token.
MSG
  exit "$AUTH_EXIT"
}

install_tools
configure_auth

# node:22-bookworm has node, not necessarily python3.
read_item() {
  node -e "const i=JSON.parse(process.env.QUEUE_ITEM_JSON); process.stdout.write(String(i[process.argv[1]] ?? ''))" "$1"
}
REPO="$(read_item repo)"
REF="$(read_item ref)"
REF="${REF:-main}"
WORKDIR="$(read_item workdir)"
ITEM_ID="$(read_item id)"
PROMPT="$(read_item prompt)"
# harness (default): this script commits, pushes and opens the PR after the
# agent exits. agent: the item's own prompt owns delivery — needed by anything
# that works across several branches, which a single folded commit cannot
# express.
DELIVERY="$(read_item delivery)"
DELIVERY="${DELIVERY:-harness}"

if [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
  echo "GH_TOKEN is not mounted — cannot clone or open a PR" >&2
  exit 1
fi
export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"

WORKDIR_ROOT="$(mktemp -d)"
trap 'rm -rf "$WORKDIR_ROOT"' EXIT
cd "$WORKDIR_ROOT"

BRANCH="agent/codex/${ITEM_ID}-$(date -u +%Y%m%d%H%M%S)"
gh repo clone "$REPO" repo -- --depth 50 --branch "$REF"
cd repo
if [[ -n "$WORKDIR" ]]; then
  cd "$WORKDIR"
fi

git config user.name "Codex Agent"
git config user.email "agent-codex@agents.local"
git checkout -b "$BRANCH"

PROMPT_FILE="$(mktemp)"
if [[ -r "$MANDATE_FILE" ]]; then
  # Everything above the horizontal rule in mandate.md is a note to whoever
  # edits the file; the agent gets the mandate itself.
  awk 'seen { print } /^---$/ { seen = 1 }' "$MANDATE_FILE" >> "$PROMPT_FILE"
else
  echo "worker: $MANDATE_FILE is missing — running with the task prompt alone" >&2
fi

{
  echo
  echo "## Delivery"
  echo
  if [[ "$DELIVERY" == "agent" ]]; then
    cat <<'MSG'
You own delivery for this run. Push the branch or branches you worked on and
open the pull request yourself, following this repository's rules on who may
merge. Do not push to the base branch and do not force-push a branch you did
not create.
MSG
  else
    cat <<MSG
The harness owns delivery for this run. Leave the working tree in the state you
want shipped and exit — it commits your changes onto \`${BRANCH}\`, pushes, and
opens the pull request against \`${REF}\`. Do not run \`git push\` or
\`gh pr create\` yourself, and stay on \`${BRANCH}\`.
MSG
  fi
  echo
  echo "## Task"
  echo
  echo "Task id: ${ITEM_ID}"
  echo
  echo "${PROMPT}"
} >> "$PROMPT_FILE"

MODEL_ARGS=()
if [[ -n "${AGENT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$AGENT_MODEL")
fi

# `--ask-for-approval` was dropped from `codex exec` in the current CLI, which
# this Job installs unpinned — passing it aborts before a single token is
# spent. The config-key override is the supported spelling and is what
# ventures/local-site-studio's Codex workflow already runs.
set +e
OUTPUT="$(codex exec \
  --sandbox workspace-write \
  -c 'approval_policy="never"' \
  -c 'cli_auth_credentials_store="file"' \
  --json \
  "${MODEL_ARGS[@]}" \
  "$(cat "$PROMPT_FILE")" 2>&1)"
STATUS=$?
set -e

echo "$OUTPUT"

if hit_limit "$OUTPUT"; then
  echo "governor: Codex limit signal — exiting $LIMIT_EXIT so the next tick backs off"
  exit "$LIMIT_EXIT"
fi

if [[ "$STATUS" -ne 0 ]] && hit_auth_failure "$OUTPUT"; then
  echo "worker: the Codex credential was rejected (mode: ${AUTH_MODE})." >&2
  if [[ "$AUTH_MODE" == "subscription" ]]; then
    echo "worker: re-run \`codex login\` and re-seal CODEX_AUTH_JSON — a rotated refresh token cannot be recovered here." >&2
  fi
  exit "$AUTH_EXIT"
fi

if [[ "$STATUS" -ne 0 ]]; then
  exit "$STATUS"
fi

if [[ "$DELIVERY" == "agent" ]]; then
  echo "worker: delivery is the agent's for this item; not opening a PR"
  exit 0
fi

# Back to repo root for git operations.
cd "$WORKDIR_ROOT/repo"

# Folding onto $REF is only correct while we are still on the branch this
# script created. If the agent moved off it, the fold would rewrite someone
# else's history onto the wrong base — stop instead.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "worker: agent left HEAD on '$CURRENT_BRANCH', not '$BRANCH' — not folding or pushing" >&2
  exit 1
fi

git add -A
if git diff --cached --quiet && [[ -z "$(git log --oneline "$REF"..HEAD 2>/dev/null || true)" ]]; then
  echo "no changes; not opening a PR"
  exit 0
fi

# Fold any commits the tool made itself so we can scan one staged diff.
git reset --soft "$REF"
git add -A
if git diff --cached --quiet; then
  echo "no changes after fold; not opening a PR"
  exit 0
fi

git commit -m "agent: ${ITEM_ID}"

# If the agent pushed this work itself despite the delivery instruction, a
# second PR carrying the same diff is worse than no PR at all. `ls-remote`
# rather than a remote-tracking ref: the clone is shallow and single-branch,
# so `git branch -r` only ever knows about $REF.
if git ls-remote --heads origin 2>/dev/null | grep -q "^$(git rev-parse HEAD)[[:space:]]"; then
  echo "worker: this commit is already the tip of a remote branch — not opening a second PR"
  exit 0
fi

git push -u origin "$BRANCH"
gh pr create --base "$REF" --head "$BRANCH" \
  --title "agent: ${ITEM_ID}" \
  --body "Opened by the hel1 Codex governor from queue item \`${ITEM_ID}\`. Merge follows this repository's normal rules for product PRs; the worker itself never merges."
