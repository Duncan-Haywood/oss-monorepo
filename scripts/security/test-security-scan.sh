#!/usr/bin/env bash
set -euo pipefail

# Contract tests for scripts/security-scan.sh.
#
# The roadmap this scanner writes is the release gate, so the property that
# matters most is negative: a run that cannot actually audit a package must
# never publish a clean bill of health. Every case below drives the scanner
# against a fixture tree with a stubbed npm so the outcome is deterministic and
# needs no registry access.

scanner="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/security-scan.sh"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/security-scan-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

failures=0

fail() {
  printf '✖ %s\n' "$1" >&2
  failures=$((failures + 1))
}

# Build a fixture repository whose stubbed npm reproduces one npm audit
# behaviour, then run the scanner inside it.
new_fixture() {
  local name="$1"
  local npm_stub_body="$2"
  local with_lockfile="$3"
  local root="$test_root/$name"

  mkdir -p "$root/scripts" "$root/ventures/demo" "$root/portfolio" "$root/bin"
  cp "$scanner" "$root/scripts/security-scan.sh"
  printf '{"name":"demo","version":"1.0.0"}\n' >"$root/ventures/demo/package.json"
  if [ "$with_lockfile" = "lockfile" ]; then
    printf '{"name":"demo","lockfileVersion":3,"packages":{}}\n' \
      >"$root/ventures/demo/package-lock.json"
  fi

  {
    printf '#!/usr/bin/env bash\n'
    printf '%s\n' "$npm_stub_body"
  } >"$root/bin/npm"
  chmod +x "$root/bin/npm"

  printf '%s\n' "$root"
}

run_scanner() {
  local root="$1"
  SECURITY_SCAN_OFFLINE=0 PATH="$root/bin:$PATH" bash "$root/scripts/security-scan.sh" >"$root/stdout.log" 2>"$root/stderr.log"
}

audit_json() {
  local critical="$1" high="$2" total="$3" body="$4"
  printf 'cat <<'\''JSON'\''\n{"auditReportVersion":2,"vulnerabilities":%s,"metadata":{"vulnerabilities":{"critical":%s,"high":%s,"moderate":0,"low":0,"total":%s}}}\nJSON\n' \
    "$body" "$critical" "$high" "$total"
}

# A genuinely clean audit publishes a clean roadmap.
clean_fixture="$(new_fixture clean "$(audit_json 0 0 0 '{}')" lockfile)"
if run_scanner "$clean_fixture"; then
  grep -q '| \*\*CLEAN\*\* |' "$clean_fixture/SECURITY_ROADMAP.md" ||
    fail "a clean audit should record the CLEAN row"
  grep -q '🚨 \*\*CRITICAL\*\* | \*\*0\*\*' "$clean_fixture/SECURITY_ROADMAP.md" ||
    fail "a clean audit should record zero critical findings"
else
  fail "a clean audit should exit zero"
fi

# Findings are transcribed into the roadmap with their severity.
finding_body='{"left-pad":{"name":"left-pad","severity":"critical","via":["fixture advisory"],"range":"<1.0.0","fixAvailable":true}}'
finding_fixture="$(new_fixture findings "$(audit_json 1 0 1 "$finding_body")" lockfile)"
if run_scanner "$finding_fixture"; then
  grep -q '🚨 \*\*CRITICAL\*\* | \*\*1\*\*' "$finding_fixture/SECURITY_ROADMAP.md" ||
    fail "a critical finding should be counted on the dashboard"
  grep -q 'left-pad' "$finding_fixture/SECURITY_ROADMAP.md" ||
    fail "a critical finding should be listed in the findings table"
else
  fail "a scan that finds vulnerabilities should still publish the roadmap"
fi

# The regression this suite exists for: npm audit failing must not be read as
# "no vulnerabilities". The previously recorded findings have to survive.
# shellcheck disable=SC2016 # the backticks are literal roadmap markdown
recorded_row='| ventures/demo | `left-pad` | **CRITICAL** | <1.0.0 | fixture advisory | npm audit fix | [ ] Scheduled |'
broken_fixture="$(new_fixture broken-npm 'echo "npm error code ENOTFOUND" >&2; exit 1' lockfile)"
printf '%s\n' "$recorded_row" >"$broken_fixture/SECURITY_ROADMAP.md"
if run_scanner "$broken_fixture"; then
  fail "a failed npm audit should exit non-zero"
fi
grep -qF "$recorded_row" "$broken_fixture/SECURITY_ROADMAP.md" ||
  fail "a failed npm audit must not overwrite the recorded findings"
grep -q 'Incomplete audit' "$broken_fixture/stderr.log" ||
  fail "a failed npm audit should explain why the roadmap was not rewritten"

# npm exiting zero with an unusable payload is the same class of failure.
empty_fixture="$(new_fixture empty-report 'exit 0' lockfile)"
printf '%s\n' "$recorded_row" >"$empty_fixture/SECURITY_ROADMAP.md"
if run_scanner "$empty_fixture"; then
  fail "an empty npm audit report should exit non-zero"
fi
grep -qF "$recorded_row" "$empty_fixture/SECURITY_ROADMAP.md" ||
  fail "an empty npm audit report must not overwrite the recorded findings"

# Auditing without a lockfile proves nothing about the installed graph.
nolock_fixture="$(new_fixture no-lockfile "$(audit_json 0 0 0 '{}')" no-lockfile)"
printf '%s\n' "$recorded_row" >"$nolock_fixture/SECURITY_ROADMAP.md"
if run_scanner "$nolock_fixture"; then
  fail "a package without a lockfile should exit non-zero"
fi
grep -qF "$recorded_row" "$nolock_fixture/SECURITY_ROADMAP.md" ||
  fail "a package without a lockfile must not overwrite the recorded findings"
grep -q 'no npm or pnpm lockfile to audit' "$nolock_fixture/stderr.log" ||
  fail "a package without a lockfile should be reported as an audit gap"

# An offline run audits nothing, so it must be treated as an audit gap rather
# than as a clean result. Regression: the offline branch counted every package
# as audited without auditing it and recorded no gap, so a scan on a sandboxed
# or network-isolated runner satisfied the completeness guard and rewrote the
# roadmap as CLEAN, discarding every recorded finding.
offline_fixture="$(new_fixture offline "$(audit_json 0 0 0 '{}')" lockfile)"
printf '%s\n' "$recorded_row" >"$offline_fixture/SECURITY_ROADMAP.md"
if SECURITY_SCAN_OFFLINE=1 PATH="$offline_fixture/bin:$PATH" \
  bash "$offline_fixture/scripts/security-scan.sh" \
  >"$offline_fixture/stdout.log" 2>"$offline_fixture/stderr.log"; then
  fail "an offline scan should exit non-zero"
fi
grep -qF "$recorded_row" "$offline_fixture/SECURITY_ROADMAP.md" ||
  fail "an offline scan must not overwrite the recorded findings"
grep -q 'registry unreachable' "$offline_fixture/stderr.log" ||
  fail "an offline scan should report each unaudited package as an audit gap"
if grep -q '| \*\*CLEAN\*\* |' "$offline_fixture/SECURITY_ROADMAP.md"; then
  fail "an offline scan must never publish a clean bill of health"
fi

if [ "$failures" -ne 0 ]; then
  printf 'security-scan contract tests failed: %d\n' "$failures" >&2
  exit 1
fi

printf 'security-scan contract tests passed\n'
