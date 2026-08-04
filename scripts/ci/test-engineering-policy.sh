#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
failures=0

require_file() {
  local path="$1"
  if [[ ! -s "$repo_root/$path" ]]; then
    printf 'missing required engineering policy file: %s\n' "$path" >&2
    failures=$((failures + 1))
  fi
}

require_text() {
  local path="$1"
  local pattern="$2"
  local description="$3"
  if ! grep -Eqi "$pattern" "$repo_root/$path"; then
    printf '%s is missing %s\n' "$path" "$description" >&2
    failures=$((failures + 1))
  fi
}

for path in \
  ENGINEERING-PRINCIPLES.md \
  CONTRIBUTING.md \
  AGENTS.md \
  docs/ENGINEERING-ROADMAP.md \
  docs/DEV-WORKFLOW.md \
  docs/CI-CD-ARCHITECTURE.md \
  SECURITY.md \
  docs/EXCEPTION-REGISTER.md \
  platform/exception-register.yaml \
  platform/VENTURE.template.yaml; do
  require_file "$path"
done

require_text README.md 'ENGINEERING-PRINCIPLES\.md' 'the principles entrypoint'
require_text CONTRIBUTING.md 'scripts/dev-verify\.sh' 'the local verification command'
require_text ENGINEERING-PRINCIPLES.md 'if it is not tested, it is broken' 'the test-first philosophy'
require_text ENGINEERING-PRINCIPLES.md '90%.*(line|statement)|line/function/statement coverage.*90%' 'the production coverage floor'
require_text ENGINEERING-PRINCIPLES.md 'full Git SHA' 'immutable source identity'
require_text ENGINEERING-PRINCIPLES.md 'Argo CD' 'declarative GitOps reconciliation'
require_text ENGINEERING-PRINCIPLES.md 'SBOM' 'software-bill-of-materials policy'
require_text ENGINEERING-PRINCIPLES.md 'customer satisfaction' 'customer-satisfaction measurement'
require_text ENGINEERING-PRINCIPLES.md 'lawful basis' 'lawful data processing'
require_text ENGINEERING-PRINCIPLES.md 'FMEA' 'industrial reliability analysis'
require_text docs/ENGINEERING-ROADMAP.md 'data-quality tests' 'analytics data-quality work'
require_text docs/ENGINEERING-ROADMAP.md 'feedback operations' 'closed-loop feedback work'
require_text platform/VENTURE.template.yaml '^engineering:' 'venture engineering controls'
require_text platform/VENTURE.template.yaml '^  customer_feedback:' 'venture feedback controls'
require_text platform/VENTURE.template.yaml '^  privacy:' 'venture privacy controls'

for venture_file in "$repo_root"/ventures/*/VENTURE.yaml; do
  rel_path="${venture_file#"$repo_root"/}"
  require_text "$rel_path" '^engineering:' 'engineering controls block'
done

if ((failures > 0)); then
  printf 'engineering policy contract failed with %d issue(s)\n' "$failures" >&2
  exit 1
fi

printf 'engineering policy contract passed\n'
