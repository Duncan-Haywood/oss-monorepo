#!/usr/bin/env bash
# Headless Antigravity CLI (agy) invocation for the agent runner.
# Usage: antigravity.sh <prompt-file>   (run with cwd = the repo workspace)
#
# ⚠️  LOWER CONFIDENCE THAN THE OTHER THREE RUNNER SCRIPTS. Antigravity CLI
# is Google's replacement for the now-sunsetting Gemini CLI, and as of
# writing its own docs site (antigravity.google/docs/cli/*) doesn't fully
# document headless-mode CLI flags — only interactive settings.json config
# for permissions/sandbox. What's used below is best-effort, cross-checked
# against what IS confirmed:
#   - binary name `agy` and install command are confirmed from official docs
#   - `-p` for a non-interactive prompt matches the sibling Gemini CLI it
#     replaces and multiple secondary sources, but isn't in agy's own docs
#   - there's a documented upstream footgun: `--dangerously-skip-permissions`
#     combined with `--sandbox` silently defeats the sandbox (the bypass
#     flag also auto-approves the "allowed to escape sandbox?" prompt) —
#     see https://github.com/google-antigravity/antigravity-cli/issues/36
#     so this script deliberately does NOT pass that flag. Instead it
#     relies on `--sandbox` (real OS-level sandboxing: nsjail on Linux) plus
#     a ONE-TIME MANUAL SETUP STEP: run `agy` interactively once, open
#     `/permissions`, and set the autonomy level to `always-proceed` so
#     unattended runs don't block waiting for approval. This is not done by
#     Ansible — settings.json's exact path wasn't confirmed from primary
#     docs, and deploying a config file to a guessed path would be worse
#     than not deploying one at all (silent no-op vs. a clear one-time step).
#
# Run `agy --help` on the actual box and compare against this before
# trusting it with dry_run: false.

set -euo pipefail

PROMPT_FILE="$1"
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

if ! command -v agy >/dev/null 2>&1; then
  echo "agy CLI not found on PATH" >&2
  exit 127
fi

agy -p "$(cat "$PROMPT_FILE")" --sandbox
