#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TMPDIR="/private/tmp"
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
run_step "Repository security policy" bash "$repo_root/scripts/security/scan-repository.sh" "${TMPDIR:-/tmp}/monorepo-security-policy.md"

if command -v actionlint >/dev/null 2>&1; then
  run_step "Workflow syntax" actionlint "$repo_root"/.github/workflows/*.yml
fi
if command -v shellcheck >/dev/null 2>&1; then
  run_step "Shell scripts" shellcheck -S warning "$repo_root"/scripts/*.sh "$repo_root"/scripts/ci/*.sh "$repo_root"/scripts/security/*.sh
fi
if command -v terraform >/dev/null 2>&1; then
  run_step "Terraform formatting" terraform -chdir="$repo_root/platform/terraform" fmt -check -recursive
  if [[ -d "$repo_root/platform/terraform/.terraform" ]]; then
    run_step "Terraform validation" terraform -chdir="$repo_root/platform/terraform" validate
  else
    printf '\nSkipping Terraform validation until terraform init has been run.\n'
  fi
fi

for component in pairwise ai-first-markets local-site-studio print-atelier retail-pilot-intel; do
  run_step "Application: $component" bash "$repo_root/scripts/ci/verify-component.sh" "$component"
done

if ((failures > 0)); then
  printf '\nVerification failed in %d step(s).\n' "$failures" >&2
  exit 1
fi
printf '\nAll verification steps passed.\n'
