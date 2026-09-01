#!/usr/bin/env bash
# Codex worker. Runs inside a Job on the tainted cpx22.
# Never pushes to the base branch. Never merges. Never talks to kube-apiserver.
set -euo pipefail

LIMIT_EXIT="${CODEX_LIMIT_EXIT:-42}"
AUTH_EXIT="${CODEX_AUTH_EXIT:-43}"
: "${QUEUE_ITEM_JSON:?QUEUE_ITEM_JSON is required}"

# A run can finish perfectly and still change nothing: the item's work has run
# out, so the agent looked, found no open PR to repair or no branch to drain,
# and stopped. That is a correct outcome, not a failure, and this script keeps
# exiting 0 for it.
#
# But the governor could not previously tell that run apart from one that
# shipped a feature, so an item whose work had run out kept its full share of
# the queue's weight forever. On 2026-08-31 the two highest-weighted items were
# both in exactly that state, between them 13/25ths of the Codex budget spent
# cloning the repo to confirm there was nothing to do.
#
# Report it instead. The marker goes to /dev/termination-log, which Kubernetes
# copies into the container's terminated.message where the governor already
# reads for limit errors — so the Job still shows as Succeeded and an operator
# reading `kubectl get jobs` is not told a clean run failed.
NOOP_MARKER="codex-noop"
# Same channel, for the credential the API refused. The exit code alone would
# be enough for the governor, but the marker is what shows up in `kubectl
# describe job` and `kubectl get pod -o yaml` without anyone having to look up
# what 43 means or find logs from a Job that has since been TTL'd away.
AUTH_MARKER="codex-auth-rejected"
# Overridable so the test suite can run this script outside a container and
# still assert the marker was written; in the Job it is the real path.
NOOP_LOG="${CODEX_TERMINATION_LOG:-/dev/termination-log}"
report_marker() {
  # Absent (a plain `bash worker.sh`) or unwritable — the marker is best-effort
  # and never worth failing a good run over.
  printf '%s: %s\n' "$1" "$2" > "$NOOP_LOG" 2>/dev/null || true
}
report_noop() {
  echo "worker: $1"
  report_marker "$NOOP_MARKER" "$1"
}

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
#
# Only ever consult this on a *failed* command. `codex exec --json` echoes the
# whole agent transcript, so a run that reads, writes or reasons about
# rate-limiting code prints every phrase below without anything having gone
# wrong. Scanning a successful run for them exits 42, which discards the work
# the run just finished (no commit, no push, no PR) and puts the whole fleet to
# sleep for `cooldownOnLimitSeconds` — an hour of the queue lost to a substring
# in someone's diff. `hit_auth_failure` was already gated this way; this is the
# same rule applied to the signal that costs more when it misfires.
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
  report_marker "$AUTH_MARKER" "no Codex credential is mounted in codex-secrets"
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
# Full history, every branch. Deliberately NOT `--depth`, which this line
# carried until it was measured.
#
# `--depth` implies `--single-branch`, so the clone came back with its refspec
# pinned to `+refs/heads/$REF:refs/remotes/origin/$REF` and no merge base for
# anything else. That breaks the queue's two highest-priority items outright:
#
#   open-pr-repair-merge (6)  resolves a conflict by merging $REF into a PR
#                             branch. In a depth-50 clone that fetch comes back
#                             shallow and the merge aborts with
#                             `fatal: refusing to merge unrelated histories`.
#   branch-pr-drain (5)       enumerates branches with unique commits. Under the
#                             pinned refspec `git branch -r` knows only $REF, so
#                             there is nothing to enumerate.
#
# It also disarms the one check CLAUDE.md and mandate.md both make mandatory
# before closing a PR — `supersede_check.py` needs a merge base with `main`, and
# CLAUDE.md's own note ("Your clone is shallow. `git fetch --unshallow` before
# any of this") is written for exactly this failure. Nothing in the prompt told
# the agent to unshallow, so between them those items are 11/25ths of the
# governor's weight aimed at work the checkout cannot do.
#
# The pack is ~64 MiB. A few seconds and that much disk on the cpx22, once per
# Job, is the whole cost of the fix.
gh repo clone "$REPO" repo -- --branch "$REF"
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

if [[ "$STATUS" -ne 0 ]] && hit_limit "$OUTPUT"; then
  echo "governor: Codex limit signal — exiting $LIMIT_EXIT so the next tick backs off"
  exit "$LIMIT_EXIT"
fi

if [[ "$STATUS" -ne 0 ]] && hit_auth_failure "$OUTPUT"; then
  echo "worker: the Codex credential was rejected (mode: ${AUTH_MODE})." >&2
  if [[ "$AUTH_MODE" == "subscription" ]]; then
    echo "worker: re-run \`codex login\` and re-seal CODEX_AUTH_JSON — a rotated refresh token cannot be recovered here." >&2
  fi
  report_marker "$AUTH_MARKER" "credential rejected (mode: ${AUTH_MODE}); re-seal codex-secrets"
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
  report_noop "no changes; not opening a PR"
  exit 0
fi

open_pr() {
  gh pr create --base "$REF" --head "$1" \
    --title "agent: ${ITEM_ID}" \
    --body "Opened by the hel1 Codex governor from queue item \`${ITEM_ID}\`. Merge follows this repository's normal rules for product PRs; the worker itself never merges."
}

# Did the agent push this work itself, despite being told delivery is the
# harness's? Ask before folding, not after.
#
# This check used to sit *below* `git reset --soft "$REF" && git commit`, which
# mints a commit with a new message and a new timestamp — so its SHA could
# never match a remote head and the check could not fire at all. What happened
# instead, every time: the fold rewrote what the agent had already pushed, the
# push came back `! [rejected] ... (non-fast-forward)`, `set -e` failed the Job,
# and the agent's branch was left sitting on the remote with no pull request —
# the one state this repository's rules say a branch with real work must never
# be left in. `gitops/tests/test_worker_run.py` reproduces it.
#
# `ls-remote` rather than a remote-tracking ref, because this asks about the
# remote as it is *now*. The branch we are looking for is one the agent pushed
# during this run — minutes after the clone — so no remote-tracking ref can
# know about it. `git branch -r` answers from the refs the last fetch wrote,
# which is a snapshot from before the push happened.
#
# This comment used to give a different reason: that the clone was "shallow and
# single-branch, so `git branch -r` only ever knows about $REF". That stopped
# being true when the `--depth` was deliberately removed above (see the long
# note on the `gh repo clone` line), and `test_worker_run.py` now asserts
# `git rev-parse --is-shallow-repository` is false. Left as it was, the stale
# reason invited exactly the wrong cleanup: a future reader who noticed the
# clone is full would "simplify" this to `git branch -r` and silently break the
# check, because the real reason is staleness, not clone depth.
#
# Match on the SHA rather than the branch name, because an agent that pushed
# `HEAD:refs/heads/something-else` delivered the same commit under a name this
# script never chose.
#
# Only ask when HEAD is actually ahead of $REF. In the ordinary run the agent
# commits nothing, so HEAD *is* $REF's tip — which is a remote head, matches on
# SHA, and would send this whole branch down the already-pushed path and commit
# the run's work straight onto the base branch. `$REF` is excluded a second
# time by name for the same reason: never let this block name the base branch.
PUSHED_REF=""
if [[ -n "$(git log --oneline "$REF"..HEAD 2>/dev/null || true)" ]]; then
  PUSHED_REF="$(git ls-remote --heads origin 2>/dev/null \
    | awk -v sha="$(git rev-parse HEAD)" -v base="refs/heads/$REF" \
        '$1 == sha && $2 != base { sub("refs/heads/", "", $2); print $2; exit }')"
fi

if [[ -n "$PUSHED_REF" ]]; then
  # Never fold on top of a published branch. Anything the agent left
  # uncommitted goes on as an ordinary commit, so nothing it wrote is lost and
  # no history that is already on the remote gets rewritten.
  if ! git diff --cached --quiet; then
    git commit -m "agent: ${ITEM_ID} (uncommitted work the agent left behind)"
    git push origin "HEAD:refs/heads/${PUSHED_REF}"
  fi

  # A second PR carrying the same diff is worse than no PR at all — but so is
  # an orphaned branch. Open one only if the agent did not.
  if gh pr list --head "$PUSHED_REF" --state open --json number --jq '.[].number' \
    2>/dev/null | grep -q '[0-9]'; then
    echo "worker: the agent pushed '$PUSHED_REF' and opened its own PR — nothing to add"
  else
    echo "worker: the agent pushed '$PUSHED_REF' itself but opened no PR — opening one rather than orphaning the branch"
    open_pr "$PUSHED_REF"
  fi
  exit 0
fi

# Fold any commits the tool made itself so we can scan one staged diff.
git reset --soft "$REF"
git add -A
if git diff --cached --quiet; then
  report_noop "no changes after fold; not opening a PR"
  exit 0
fi

git commit -m "agent: ${ITEM_ID}"

git push -u origin "$BRANCH"
open_pr "$BRANCH"
