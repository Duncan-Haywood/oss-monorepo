#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-component.sh"

if "$script" unknown-component >/dev/null 2>&1; then
  printf 'unknown components must fail\n' >&2
  exit 1
fi

grep -q 'set -euo pipefail' "$script"
if grep -Eq 'npm (ci|install).*(\|\| true|\|\| npm install)' "$script"; then
  printf 'dependency installation must fail closed\n' >&2
  exit 1
fi
if grep -Eq '(typecheck|lint|test|build).*\|\| true' "$script"; then
  printf 'quality gates must not swallow failures\n' >&2
  exit 1
fi

printf 'component verification contract tests passed\n'
