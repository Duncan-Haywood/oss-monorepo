#!/usr/bin/env bash
set -euo pipefail

# Contract tests for scripts/security-scan.sh.
#
# The roadmap this scanner writes is the release gate, so the property that
# matters most is negative: a run that cannot actually audit a package must
# never publish a clean bill of health over the recorded findings. Every case
# drives the scanner against a fixture tree with a stubbed package manager, so
# outcomes are deterministic and need no registry access.

scanner="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/security-scan.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/security-scan-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

failures=0

fail() {
  printf '✖ %s\n' "$1" >&2
  failures=$((failures + 1))
}

# A previously recorded finding. Every incomplete-scan case asserts this row
# survives, which is exactly what the silent-clean regression destroyed.
# shellcheck disable=SC2016 # the backticks are literal roadmap markdown
recorded_row='| ventures/demo | `left-pad` | **CRITICAL** | <1.0.0 | fixture advisory | npm audit fix | [ ] Scheduled |'

# Build a fixture repository whose stubbed package manager reproduces one audit
# behaviour. lockfile is one of: npm, pnpm, none.
new_fixture() {
  local name="$1" manager="$2" stub_body="$3" lockfile="$4"
  local root="$test_root/$name"

  mkdir -p "$root/scripts" "$root/ventures/demo" "$root/portfolio" "$root/bin"
  cp "$scanner" "$root/scripts/security-scan.sh"
  printf '{"name":"demo","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
    >"$root/ventures/demo/package.json"

  case "$lockfile" in
    npm) printf '{"name":"demo","lockfileVersion":3,"packages":{}}\n' >"$root/ventures/demo/package-lock.json" ;;
    pnpm) printf 'lockfileVersion: "9.0"\n' >"$root/ventures/demo/pnpm-lock.yaml" ;;
    none) ;;
  esac

  {
    printf '#!/usr/bin/env bash\n'
    printf '%s\n' "$stub_body"
  } >"$root/bin/$manager"
  chmod +x "$root/bin/$manager"

  printf '%s\n' "$root"
}

run_scanner() {
  local root="$1"
  PATH="$root/bin:$PATH" bash "$root/scripts/security-scan.sh" \
    >"$root/stdout.log" 2>"$root/stderr.log"
}

npm_report() {
  local critical="$1" high="$2" body="$3"
  printf 'cat <<'\''JSON'\''\n{"auditReportVersion":2,"vulnerabilities":%s,"metadata":{"vulnerabilities":{"critical":%s,"high":%s,"moderate":0,"low":0,"total":%s}}}\nJSON\n' \
    "$body" "$critical" "$high" "$((critical + high))"
}

# A genuinely clean audit publishes a clean roadmap.
clean_fixture="$(new_fixture clean npm "$(npm_report 0 0 '{}')" npm)"
if run_scanner "$clean_fixture"; then
  grep -q '| \*\*CLEAN\*\* |' "$clean_fixture/SECURITY_ROADMAP.md" ||
    fail "a clean audit should record the CLEAN row"
  grep -q '🚨 \*\*CRITICAL\*\* | \*\*0\*\*' "$clean_fixture/SECURITY_ROADMAP.md" ||
    fail "a clean audit should record zero critical findings"
else
  fail "a clean audit should exit zero"
fi

# Findings are transcribed into the roadmap with their severity.
npm_body='{"left-pad":{"name":"left-pad","severity":"critical","via":["fixture advisory"],"range":"<1.0.0","fixAvailable":true}}'
finding_fixture="$(new_fixture findings npm "$(npm_report 1 0 "$npm_body")" npm)"
if run_scanner "$finding_fixture"; then
  grep -q '🚨 \*\*CRITICAL\*\* | \*\*1\*\*' "$finding_fixture/SECURITY_ROADMAP.md" ||
    fail "a critical finding should be counted on the dashboard"
  grep -q 'left-pad' "$finding_fixture/SECURITY_ROADMAP.md" ||
    fail "a critical finding should be listed in the findings table"
else
  fail "a scan that finds vulnerabilities should still publish the roadmap"
fi

# pnpm reports advisories under a different key; they belong in the roadmap too.
pnpm_stub='cat <<'\''JSON'\''
{"advisories":{"1120680":{"module_name":"esbuild","severity":"high","title":"fixture advisory","vulnerable_versions":"<=0.28.0","patched_versions":">=0.28.1"}},"metadata":{"vulnerabilities":{"critical":0,"high":1,"moderate":0,"low":0}}}
JSON'
pnpm_fixture="$(new_fixture pnpm-findings pnpm "$pnpm_stub" pnpm)"
if run_scanner "$pnpm_fixture"; then
  grep -q '⚠️ \*\*HIGH\*\* | \*\*1\*\*' "$pnpm_fixture/SECURITY_ROADMAP.md" ||
    fail "a pnpm advisory should be counted on the dashboard"
  grep -q 'esbuild' "$pnpm_fixture/SECURITY_ROADMAP.md" ||
    fail "a pnpm advisory should be listed in the findings table"
else
  fail "a pnpm workspace scan should publish the roadmap"
fi

# The regression this suite exists for: a failed audit must not read as "no
# vulnerabilities", and the recorded findings have to survive it.
broken_fixture="$(new_fixture broken-npm npm 'echo "npm error code ENOTFOUND" >&2; exit 1' npm)"
printf '%s\n' "$recorded_row" >"$broken_fixture/SECURITY_ROADMAP.md"
if run_scanner "$broken_fixture"; then
  fail "a failed npm audit should exit non-zero"
fi
grep -qF "$recorded_row" "$broken_fixture/SECURITY_ROADMAP.md" ||
  fail "a failed npm audit must not overwrite the recorded findings"
grep -q 'Incomplete audit' "$broken_fixture/stderr.log" ||
  fail "a failed npm audit should explain why the roadmap was not rewritten"
grep -q 'ENOTFOUND' "$broken_fixture/stderr.log" ||
  fail "a failed npm audit should report the underlying reason"

# npm exiting zero with an unusable payload is the same class of failure.
empty_fixture="$(new_fixture empty-report npm 'exit 0' npm)"
printf '%s\n' "$recorded_row" >"$empty_fixture/SECURITY_ROADMAP.md"
if run_scanner "$empty_fixture"; then
  fail "an empty npm audit report should exit non-zero"
fi
grep -qF "$recorded_row" "$empty_fixture/SECURITY_ROADMAP.md" ||
  fail "an empty npm audit report must not overwrite the recorded findings"

# Dependencies without a lockfile prove nothing about the installed graph.
nolock_fixture="$(new_fixture no-lockfile npm "$(npm_report 0 0 '{}')" none)"
printf '%s\n' "$recorded_row" >"$nolock_fixture/SECURITY_ROADMAP.md"
if run_scanner "$nolock_fixture"; then
  fail "a package with dependencies but no lockfile should exit non-zero"
fi
grep -qF "$recorded_row" "$nolock_fixture/SECURITY_ROADMAP.md" ||
  fail "a package with no lockfile must not overwrite the recorded findings"
grep -q 'no lockfile' "$nolock_fixture/stderr.log" ||
  fail "a package with no lockfile should be reported as an audit gap"

# A package that declares no dependencies has nothing to audit, and a workspace
# member is covered by its root lockfile. Neither is an audit gap.
noop_fixture="$(new_fixture no-dependencies npm "$(npm_report 0 0 '{}')" none)"
printf '{"name":"demo","version":"1.0.0","private":true}\n' \
  >"$noop_fixture/ventures/demo/package.json"
run_scanner "$noop_fixture" ||
  fail "a package with no declared dependencies should not block the scan"

workspace_fixture="$(new_fixture pnpm-workspace pnpm "$pnpm_stub" pnpm)"
mkdir -p "$workspace_fixture/ventures/demo/packages/member"
printf 'packages:\n  - packages/*\n' >"$workspace_fixture/ventures/demo/pnpm-workspace.yaml"
printf '{"name":"member","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
  >"$workspace_fixture/ventures/demo/packages/member/package.json"
if run_scanner "$workspace_fixture"; then
  grep -q 'covered by its pnpm workspace lockfile' "$workspace_fixture/stdout.log" ||
    fail "a pnpm workspace member should be reported as covered by its root"
else
  fail "a pnpm workspace member should not be treated as an audit gap"
fi

if [ "$failures" -ne 0 ]; then
  printf 'security-scan contract tests failed: %d\n' "$failures" >&2
  exit 1
fi

printf 'security-scan contract tests passed\n'
