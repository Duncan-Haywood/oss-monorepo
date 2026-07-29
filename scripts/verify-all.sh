#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="${TMPDIR:-/private/tmp}"
failures=0

run_step() {
  local name="$1"
  shift
  printf '\n==> %s\n' "$name"
  if ! "$@"; then
    printf 'FAILED: %s\n' "$name" >&2
    failures=$((failures + 1))
  fi
}

run_step "CI contract tests" bash "$repo_root/scripts/ci/test-verify-component.sh"
run_step "Repository policy scanner tests" bash "$repo_root/scripts/security/test-scan-repository.sh"
run_step "CI Engine unit tests" env PYTHONPATH="$repo_root" python3 -m unittest discover -s "$repo_root/platform/ci"

if command -v actionlint >/dev/null 2>&1; then
  run_step "Workflow syntax" actionlint "$repo_root"/.github/workflows/*.yml
fi
if command -v shellcheck >/dev/null 2>&1; then
  run_step "Shell scripts" shellcheck -S warning "$repo_root"/scripts/*.sh "$repo_root"/scripts/ci/*.sh "$repo_root"/scripts/security/*.sh
fi

run_step "Universal CI Pipeline Engine" env PYTHONPATH="$repo_root" python3 -m platform.ci.pipeline "$@"

if ((failures > 0)); then
  printf '\nVerification failed in %d step(s).\n' "$failures" >&2
  exit 1
fi
printf '\nAll verification steps passed successfully.\n'
