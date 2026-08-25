#!/usr/bin/env bash
# Codex worker. Runs inside a Job on the tainted cpx22.
# Never pushes to the base branch. Never merges. Never talks to kube-apiserver.
set -euo pipefail

LIMIT_EXIT="${CODEX_LIMIT_EXIT:-42}"
: "${QUEUE_ITEM_JSON:?QUEUE_ITEM_JSON is required}"

export PATH="/usr/local/bin:$HOME/.npm-global/bin:$PATH"
export npm_config_prefix="$HOME/.npm-global"
mkdir -p "$HOME/.npm-global"

if [[ -z "${CODEX_ACCESS_TOKEN:-}${OPENAI_API_KEY:-}" ]]; then
  echo "CODEX_ACCESS_TOKEN (or OPENAI_API_KEY) is not mounted — refusing to start" >&2
  exit 1
fi

# Detect typical limit language from a command's combined output.
hit_limit() {
  local text="$1"
  grep -Eiq '429|rate.?limit|usage.?limit|exceeded.*quota|hit your (usage )?limit|limit reached' <<<"$text"
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
    npm install -g @openai/codex
  fi
}

install_tools

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
cat > "$PROMPT_FILE" <<EOF
You are working autonomously and unattended. Make the smallest correct
change that addresses the task. Do not push to the base branch and do
not merge. Prefer leaving the repo unchanged over guessing.

Task id: ${ITEM_ID}

${PROMPT}
EOF

MODEL_ARGS=()
if [[ -n "${AGENT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$AGENT_MODEL")
fi

set +e
OUTPUT="$(codex exec \
  --sandbox workspace-write \
  --ask-for-approval never \
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

if [[ "$STATUS" -ne 0 ]]; then
  exit "$STATUS"
fi

# Back to repo root for git operations.
cd "$WORKDIR_ROOT/repo"
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
git push -u origin "$BRANCH"
gh pr create --base "$REF" --head "$BRANCH" \
  --title "agent: ${ITEM_ID}" \
  --body "Opened by the hel1 Codex governor. Human merge only."
