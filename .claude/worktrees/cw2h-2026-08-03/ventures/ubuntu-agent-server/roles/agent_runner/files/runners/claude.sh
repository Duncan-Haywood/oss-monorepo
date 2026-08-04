#!/usr/bin/env bash
# Headless Claude Code invocation for the agent runner.
# Usage: claude.sh <prompt-file>   (run with cwd = the repo workspace)
#
# Permission mode defaults to `auto` — Claude's classifier-guarded autonomy
# mode, which allows normal dev work (edits, tests, commits, pushes to any
# branch of the current repo) while blocking a documented list of dangerous
# actions (force push, secret exfiltration, destructive deletes, deploys,
# IAM changes, merging its own PR, etc). This is a meaningfully better fit
# for unattended work than --dangerously-skip-permissions, which Anthropic's
# own docs say to use only inside fully isolated containers/VMs — not
# applicable here since this runs directly on the host.
#
# `auto` mode requires a supporting plan/model (see Anthropic's permission-
# modes docs — Opus 4.6+/Sonnet 4.6+/Fable 5 class models, available on all
# plans). If it's unavailable for your account, override:
#   CLAUDE_PERMISSION_MODE=dontAsk
# `dontAsk` is far more restrictive by default (denies anything not covered
# by an explicit permissions.allow rule) — you'd need to pre-configure
# ~/.claude/settings.json with allow rules for Edit/Write and the Bash
# commands (git, your test runner, etc.) you want it to be able to run
# unattended. Not set up here; test with `dry_run: true` first either way.

# AGENT_MODEL, if set by agent_runner.py's model-tier routing (see
# MODEL_BY_TIER in agent_runner.py), picks the model alias — "haiku" for
# low-tier/cheap, "sonnet" for high-tier. Unset means whatever your
# account's default model is.

set -euo pipefail

PROMPT_FILE="$1"
export PATH="$HOME/.npm-global/bin:$PATH"

PERMISSION_MODE="${CLAUDE_PERMISSION_MODE:-auto}"
MODEL_ARGS=()
if [[ -n "${AGENT_MODEL:-}" ]]; then
  MODEL_ARGS=(--model "$AGENT_MODEL")
fi

claude -p "$(cat "$PROMPT_FILE")" \
  --permission-mode "$PERMISSION_MODE" \
  --output-format stream-json \
  "${MODEL_ARGS[@]}"
