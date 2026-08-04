#!/usr/bin/env bash
# Compose the final agent prompt from a prompt file + run metadata.
set -euo pipefail

PROMPT_FILE="${1:?prompt file required}"
AGENT_NAME="${2:?agent name required}"
PROMPT_KIND="${3:?prompt kind required}"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "::error::Prompt file not found: $PROMPT_FILE"
  exit 1
fi

OUT_FILE="${RUNNER_TEMP:-/tmp}/agent-prompt.md"
{
  cat "$PROMPT_FILE"
  echo
  echo "## Run context"
  echo
  echo "- Agent: ${AGENT_NAME}"
  echo "- Prompt: ${PROMPT_KIND}"
  echo "- Repository: ${GITHUB_REPOSITORY:-unknown}"
  echo "- Workflow run: ${GITHUB_RUN_ID:-unknown}"
  echo "- Trigger: ${GITHUB_EVENT_NAME:-unknown}"
  echo "- Base ref: main"
  echo
  echo "Start now. Claim work, implement, verify, and open a PR."
} > "$OUT_FILE"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "PROMPT_FILE=${OUT_FILE}" >> "$GITHUB_ENV"
fi
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "prompt_file=${OUT_FILE}" >> "$GITHUB_OUTPUT"
fi
echo "Prepared prompt at ${OUT_FILE}"
