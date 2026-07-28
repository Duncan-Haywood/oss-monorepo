#!/usr/bin/env bash
# Headless opencode invocation for the agent runner.
# Usage: opencode.sh <prompt-file>   (run with cwd = the repo workspace)
#
# --auto ("Auto-approve permissions that are not explicitly denied", per
# opencode's own CLI docs) is the documented flag for unattended runs.
#
# Best-effort: there are open upstream issues about `opencode run`
# reliability in non-interactive/headless contexts (session-not-found
# errors, restrictive permission presets at session-bootstrap that aren't
# overridable in some versions). If this tool's runs fail consistently,
# that's a known rough edge, not necessarily a config mistake here — check
# https://github.com/anomalyco/opencode/issues for the current state
# before assuming this script is wrong.

set -euo pipefail

PROMPT_FILE="$1"
export PATH="$HOME/.npm-global/bin:$PATH"

opencode run --auto "$(cat "$PROMPT_FILE")"
