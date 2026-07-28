#!/usr/bin/env bash
# Headless OpenAI Codex CLI invocation for the agent runner.
# Usage: codex.sh <prompt-file>   (run with cwd = the repo workspace)
#
# --sandbox workspace-write restricts filesystem writes to the working
# directory (this clone), which is the whole point of doing a fresh clone
# per run rather than reusing a persistent checkout. --ask-for-approval
# never means blocked operations fail outright and get reported back to
# the model instead of hanging waiting for a human that isn't there.
#
# Override via env if you've verified something stricter/looser works
# better for you: CODEX_SANDBOX (default workspace-write),
# CODEX_APPROVAL (default never).
#
# AGENT_MODEL, if set by agent_runner.py's model-tier routing, picks the
# model. UNVERIFIED: the model ID strings in MODEL_BY_TIER
# ("gpt-5-mini"/"gpt-5") are a reasonable guess, not confirmed against
# current OpenAI model naming — check `codex exec --help` / your account's
# available models before trusting model_tier routing for this tool.

set -euo pipefail

PROMPT_FILE="$1"
export PATH="$HOME/.npm-global/bin:$PATH"

SANDBOX="${CODEX_SANDBOX:-workspace-write}"
APPROVAL="${CODEX_APPROVAL:-never}"
MODEL_ARGS=()
if [[ -n "${AGENT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$AGENT_MODEL")
fi

codex exec \
  --sandbox "$SANDBOX" \
  --ask-for-approval "$APPROVAL" \
  --json \
  "${MODEL_ARGS[@]}" \
  "$(cat "$PROMPT_FILE")"
