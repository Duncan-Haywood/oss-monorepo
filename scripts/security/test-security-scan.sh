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
  # A package declaring no dependencies has nothing to audit, which is a
  # separate case with its own contract below. Fixtures therefore declare a
  # dependency by default, so that every case here exercises a package the
  # scanner is genuinely required to audit.
  local dependencies="${4:-with-deps}"
  local root="$test_root/$name"

  mkdir -p "$root/scripts" "$root/ventures/demo" "$root/portfolio" "$root/bin"
  cp "$scanner" "$root/scripts/security-scan.sh"
  if [ "$dependencies" = "no-deps" ]; then
    printf '{"name":"demo","version":"1.0.0"}\n' >"$root/ventures/demo/package.json"
  else
    printf '{"name":"demo","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
      >"$root/ventures/demo/package.json"
  fi
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
  SECURITY_SCAN_ALLOW_OFFLINE=0 SECURITY_SCAN_OFFLINE=0 PATH="$root/bin:$PATH" bash "$root/scripts/security-scan.sh" >"$root/stdout.log" 2>"$root/stderr.log"
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

# A package that declares no dependencies has no graph to audit, so demanding a
# lockfile from it holds the roadmap open on a package that can never produce a
# finding. portfolio/marisstella-homepage is exactly this: no dependencies, one
# script running node:test over the standard library, and it blocked every
# rewrite of SECURITY_ROADMAP.md.
nodeps_fixture="$(new_fixture no-dependencies 'exit 1' no-lockfile no-deps)"
if run_scanner "$nodeps_fixture"; then
  grep -q '| \*\*CLEAN\*\* |' "$nodeps_fixture/SECURITY_ROADMAP.md" ||
    fail "a dependency-free package should let the roadmap be published"
else
  fail "a dependency-free package without a lockfile should exit zero"
fi
grep -q 'no dependencies declared' "$nodeps_fixture/stdout.log" ||
  fail "a dependency-free package should say why it was not audited"
grep -q 'Incomplete audit' "$nodeps_fixture/stderr.log" &&
  fail "a dependency-free package must not be recorded as an audit gap"

# The exemption must be scoped to the package that earns it. A dependency-free
# package sitting beside one that declares dependencies and ships no lockfile
# must not drag the second one through the gate with it — otherwise adding an
# empty package.json anywhere would disarm the lockfile requirement repo-wide.
mixed_fixture="$(new_fixture mixed-deps "$(audit_json 0 0 0 '{}')" no-lockfile no-deps)"
mkdir -p "$mixed_fixture/ventures/needs-audit"
printf '{"name":"needs-audit","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
  >"$mixed_fixture/ventures/needs-audit/package.json"
printf '%s\n' "$recorded_row" >"$mixed_fixture/SECURITY_ROADMAP.md"
if run_scanner "$mixed_fixture"; then
  fail "a dependency-declaring package without a lockfile should still exit non-zero"
fi
grep -qF "$recorded_row" "$mixed_fixture/SECURITY_ROADMAP.md" ||
  fail "the dependency-free exemption must not overwrite the recorded findings"
grep -q 'ventures/needs-audit: no npm or pnpm lockfile to audit' "$mixed_fixture/stderr.log" ||
  fail "the package that declares dependencies should still be reported as a gap"

# A manifest the scanner cannot parse is not a manifest declaring nothing. It
# must fall through to the normal path and be treated as unaudited, or a
# corrupt package.json would silently exempt itself.
malformed_fixture="$(new_fixture malformed-manifest "$(audit_json 0 0 0 '{}')" no-lockfile)"
printf '{"name":"demo",\n' >"$malformed_fixture/ventures/demo/package.json"
printf '%s\n' "$recorded_row" >"$malformed_fixture/SECURITY_ROADMAP.md"
if run_scanner "$malformed_fixture"; then
  fail "an unparseable package.json should not exempt itself from the audit"
fi
grep -qF "$recorded_row" "$malformed_fixture/SECURITY_ROADMAP.md" ||
  fail "an unparseable package.json must not overwrite the recorded findings"

# Declaring dependencies only under devDependencies still creates a graph an
# advisory can land in, so it must not qualify for the exemption.
devdeps_fixture="$(new_fixture dev-dependencies-only "$(audit_json 0 0 0 '{}')" no-lockfile no-deps)"
printf '{"name":"demo","version":"1.0.0","devDependencies":{"vitest":"^1.0.0"}}\n' \
  >"$devdeps_fixture/ventures/demo/package.json"
printf '%s\n' "$recorded_row" >"$devdeps_fixture/SECURITY_ROADMAP.md"
if run_scanner "$devdeps_fixture"; then
  fail "a package with only devDependencies should still require a lockfile"
fi
grep -q 'no npm or pnpm lockfile to audit' "$devdeps_fixture/stderr.log" ||
  fail "a devDependencies-only package should be reported as an audit gap"

# An offline run audits nothing, so it must be treated as an audit gap rather
# than as a clean result. Regression: the offline branch counted every package
# as audited without auditing it and recorded no gap, so a scan on a sandboxed
# or network-isolated runner satisfied the completeness guard and rewrote the
# roadmap as CLEAN, discarding every recorded finding.
offline_fixture="$(new_fixture offline "$(audit_json 0 0 0 '{}')" lockfile)"
printf '%s\n' "$recorded_row" >"$offline_fixture/SECURITY_ROADMAP.md"
if SECURITY_SCAN_ALLOW_OFFLINE=0 SECURITY_SCAN_OFFLINE=1 PATH="$offline_fixture/bin:$PATH" \
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

# The offline escape hatch may waive the non-zero exit, but never the rewrite.
# Regression: SECURITY_SCAN_ALLOW_OFFLINE=1 was honoured at the completeness
# guard itself, conditioned on HIGH_COUNT and CRITICAL_COUNT being zero. Those
# counters are zero offline precisely because nothing was audited, so the
# condition was always true and the run fell through and republished the roadmap
# as CLEAN over every recorded finding. platform/ci/src/pipeline.mjs sets the
# variable unconditionally, so this ran on every pipeline invocation.
#
# Both causes of an incomplete audit are covered: the counters carry no evidence
# about whether packages were audited, so the waiver must key on the audit gaps.
for case_name in offline broken-npm; do
  if [ "$case_name" = "offline" ]; then
    allow_fixture="$(new_fixture "allow-$case_name" "$(audit_json 0 0 0 '{}')" lockfile)"
    allow_env=(SECURITY_SCAN_OFFLINE=1)
  else
    allow_fixture="$(new_fixture "allow-$case_name" 'echo "npm error code ENOTFOUND" >&2; exit 1' lockfile)"
    allow_env=(SECURITY_SCAN_OFFLINE=0)
  fi
  printf '%s\n' "$recorded_row" >"$allow_fixture/SECURITY_ROADMAP.md"

  env "${allow_env[@]}" SECURITY_SCAN_ALLOW_OFFLINE=1 PATH="$allow_fixture/bin:$PATH" \
    bash "$allow_fixture/scripts/security-scan.sh" \
    >"$allow_fixture/stdout.log" 2>"$allow_fixture/stderr.log" || true

  grep -qF "$recorded_row" "$allow_fixture/SECURITY_ROADMAP.md" ||
    fail "SECURITY_SCAN_ALLOW_OFFLINE ($case_name) must not overwrite the recorded findings"
  if grep -q '| \*\*CLEAN\*\* |' "$allow_fixture/SECURITY_ROADMAP.md"; then
    fail "SECURITY_SCAN_ALLOW_OFFLINE ($case_name) must never publish a clean bill of health"
  fi
  grep -q 'Incomplete audit' "$allow_fixture/stderr.log" ||
    fail "SECURITY_SCAN_ALLOW_OFFLINE ($case_name) should still report the incomplete audit"
done

if [ "$failures" -ne 0 ]; then
  printf 'security-scan contract tests failed: %d\n' "$failures" >&2
  exit 1
fi

printf 'security-scan contract tests passed\n'
