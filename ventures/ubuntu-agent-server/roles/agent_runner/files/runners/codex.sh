#!/usr/bin/env bash
# Headless OpenAI Codex CLI invocation for the agent runner.
# Usage: codex.sh <prompt-file>   (run with cwd = the repo workspace)
#
# --sandbox workspace-write restricts filesystem writes to the working
# directory (this clone), which is the whole point of doing a fresh clone
# per run rather than reusing a persistent checkout. `codex exec` is
# non-interactive by construction: it never waits for a human, and an
# operation the sandbox blocks fails and is reported back to the model
# rather than hanging.
#
# The old --ask-for-approval flag was removed from `codex exec` upstream;
# passing it makes the CLI exit 2 with "unexpected argument" before a
# single token is generated, so every run died on argument parsing.
# Verified against codex-cli 0.151.0:
#
#   $ codex exec --sandbox workspace-write --ask-for-approval never --json hi
#   error: unexpected argument '--ask-for-approval' found
#   $ echo $?
#   2
#
# `-c approval_policy="never"` is the supported spelling of the same
# intent, and is what gitops/agents/workers/worker.sh — the cluster path,
# which hit this first — already runs. Stating it explicitly rather than
# leaning on the default keeps the two paths saying the same thing, and it
# survives `--strict-config` (checked: the key is recognised).
#
# Override via env if you've verified something stricter/looser works
# better for you: CODEX_SANDBOX (default workspace-write).
#
# AGENT_MODEL, if set by agent_runner.py's model-tier routing, picks the
# model. It is unset by default on purpose — see MODEL_BY_TIER in
# agent_runner.py. Leaving it unset means Codex uses the model your plan
# actually serves, which is what keeps runs on the included quota instead
# of failing on a model ID this repo guessed at.

set -euo pipefail

PROMPT_FILE="$1"
export PATH="$HOME/.npm-global/bin:$PATH"

SANDBOX="${CODEX_SANDBOX:-workspace-write}"

# Authentication: `codex login` (a ChatGPT plan sign-in) draws on that
# plan's included quota. An OPENAI_API_KEY in the environment instead
# bills the API per token. Both authenticate; they spend different
# budgets, and the difference is invisible in the run output — you find
# out on the invoice. This host is meant to run on the included quota, so
# the key is dropped from the child environment unless someone explicitly
# opts into metered billing with CODEX_USE_API_KEY=true.
if [[ "${CODEX_USE_API_KEY:-false}" != "true" ]]; then
  unset OPENAI_API_KEY
fi

# Preflight the login rather than discovering it mid-run. An unauthenticated
# `codex exec` fails per-invocation, once every poll cycle, with an error
# that reads like a model problem; this names the actual fix.
if ! codex login status >/dev/null 2>&1; then
  echo "codex.sh: not logged in." >&2
  echo "  Run 'codex login' once as this user to authenticate against your" >&2
  echo "  ChatGPT plan's included quota, then 'codex login status' to confirm." >&2
  echo "  To bill the metered API instead, set OPENAI_API_KEY and" >&2
  echo "  CODEX_USE_API_KEY=true." >&2
  exit 1
fi

MODEL_ARGS=()
if [[ -n "${AGENT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$AGENT_MODEL")
fi

codex exec \
  --sandbox "$SANDBOX" \
  -c 'approval_policy="never"' \
  --json \
  "${MODEL_ARGS[@]}" \
  "$(cat "$PROMPT_FILE")"
