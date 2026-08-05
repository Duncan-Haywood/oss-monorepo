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

# A fixture is a git work tree with all three scan roots present, because the
# scanner treats a missing root and an unverifiable discovery as audit gaps. It
# reconciles the packages its walk reached against the manifests git tracks, so
# a fixture that is not a repository can prove nothing about the healthy path.
#
# Until 2026-08-05 neither builder created `platform/` or a repository, and the
# walk's stderr went to /dev/null — so every case ran against a scan with an
# absent root and no one could tell. That is the same shape as the defect this
# suite exists to catch, sitting inside the suite itself.
init_fixture_repo() {
  local root="$1"
  git -C "$root" init -q
  git -C "$root" config user.email "fixture@example.invalid"
  git -C "$root" config user.name "fixture"
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

  mkdir -p "$root/scripts" "$root/ventures/demo" "$root/portfolio" "$root/platform" "$root/bin"
  cp "$scanner" "$root/scripts/security-scan.sh"
  init_fixture_repo "$root"
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
  # Staged here rather than in the builders because several cases add a manifest
  # after the fixture is built. The scanner's expected set is what git tracks, so
  # a case that writes a package.json and never stages it would be asserting
  # against a package the scanner does not know to expect.
  #
  # Pass `keep-index` to skip the staging step, for the one case that needs the
  # index to disagree with the working tree on purpose.
  if [ "${2:-stage}" = "stage" ]; then
    git -C "$root" add -A >/dev/null 2>&1 || true
  fi
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
# Recording the finding and refusing the run are separate obligations: the
# roadmap must be published (so the finding survives) *and* the run must fail.
# Until 2026-08-04 this case asserted only the first half, and asserted the exit
# status was zero — so the suite held the scanner's fail-open in place. The only
# `exit 1` in the scanner was the incomplete-audit refusal, which made it
# strictest when it knew least.
if run_scanner "$finding_fixture"; then
  fail "a completed audit that found a CRITICAL vulnerability should exit non-zero"
fi
grep -q '🚨 \*\*CRITICAL\*\* | \*\*1\*\*' "$finding_fixture/SECURITY_ROADMAP.md" ||
  fail "a critical finding should be counted on the dashboard"
grep -q 'left-pad' "$finding_fixture/SECURITY_ROADMAP.md" ||
  fail "a critical finding should be listed in the findings table"
grep -q 'CRITICAL dependency finding' "$finding_fixture/stderr.log" ||
  fail "a blocking critical finding should say why the run failed"

# HIGH is deliberately not a blocking severity yet: a complete audit of this
# repository is not currently reachable, so any HIGH ceiling would be seeded
# from an incomplete measurement. This pins that scope, so narrowing or
# widening it has to be a deliberate edit to both files rather than a drift.
high_body='{"left-pad":{"name":"left-pad","severity":"high","via":["fixture advisory"],"range":"<1.0.0","fixAvailable":true}}'
high_fixture="$(new_fixture high-findings "$(audit_json 0 1 1 "$high_body")" lockfile)"
if run_scanner "$high_fixture"; then
  grep -q '⚠️ \*\*HIGH\*\* | \*\*1\*\*' "$high_fixture/SECURITY_ROADMAP.md" ||
    fail "a high finding should be counted on the dashboard"
else
  fail "a high finding should be recorded without failing the run"
fi

# A committed credential blocks unconditionally. It already blocked on the
# incomplete-audit path; the case that passed was the healthy one, where every
# package audited cleanly and the secret was written to the roadmap as a HIGH
# row over an exit status of zero.
secret_fixture="$(new_fixture secret-complete-audit "$(audit_json 0 0 0 '{}')" lockfile)"
printf 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIfixtureEXAMPLEKEY\n' \
  >"$secret_fixture/ventures/demo/config.sh"
if run_scanner "$secret_fixture"; then
  fail "a clean audit that found a committed secret should exit non-zero"
fi
grep -q 'config.sh' "$secret_fixture/SECURITY_ROADMAP.md" ||
  fail "a committed secret should still be recorded in the roadmap"
grep -q 'hardcoded credential pattern' "$secret_fixture/stderr.log" ||
  fail "a blocking secret should say why the run failed"

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

# --- pnpm ---------------------------------------------------------------
#
# The cases above all drive npm. pnpm is audited by the same function through a
# different binary and a different report shape, and this merge brought the two
# together from branches that had each tested only their own half. Everything
# below is the pnpm half: without it, the `manager` selection and the advisory
# normalization are code no test executes.

# Build a fixture whose package is audited by pnpm rather than npm. The stub is
# installed as `pnpm` and a `pnpm-lock.yaml` selects it, so the scanner's own
# manager detection is what routes the call — the test does not force it.
new_pnpm_fixture() {
  local name="$1"
  local pnpm_stub_body="$2"
  local root="$test_root/$name"

  mkdir -p "$root/scripts" "$root/ventures/demo" "$root/portfolio" "$root/platform" "$root/bin"
  cp "$scanner" "$root/scripts/security-scan.sh"
  init_fixture_repo "$root"
  printf '{"name":"demo","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
    >"$root/ventures/demo/package.json"
  printf 'lockfileVersion: "9.0"\n' >"$root/ventures/demo/pnpm-lock.yaml"

  {
    printf '#!/usr/bin/env bash\n'
    printf '%s\n' "$pnpm_stub_body"
  } >"$root/bin/pnpm"
  chmod +x "$root/bin/pnpm"
  # npm must not be the thing that answers. If manager detection regresses to
  # always-npm, this stub fails the run rather than quietly passing it.
  {
    printf '#!/usr/bin/env bash\n'
    printf 'echo "npm should not have been invoked for a pnpm package" >&2\n'
    printf 'exit 1\n'
  } >"$root/bin/npm"
  chmod +x "$root/bin/npm"

  printf '%s\n' "$root"
}

pnpm_advisory_stub='cat <<'\''JSON'\''
{"advisories":{"1120680":{"module_name":"esbuild","severity":"high","title":"fixture advisory","vulnerable_versions":"<=0.28.0","patched_versions":">=0.28.1"}},"metadata":{"vulnerabilities":{"critical":0,"high":1,"moderate":0,"low":0}}}
JSON'

# pnpm reports advisories under a different key than npm's `vulnerabilities`
# map. They are findings either way and belong in the roadmap; a scanner that
# understood only npm's shape would count this package as audited and clean.
pnpm_fixture="$(new_pnpm_fixture pnpm-findings "$pnpm_advisory_stub")"
if run_scanner "$pnpm_fixture"; then
  grep -q 'esbuild' "$pnpm_fixture/SECURITY_ROADMAP.md" ||
    fail "a pnpm advisory should be listed in the findings table"
  grep -q '\*\*HIGH\*\*' "$pnpm_fixture/SECURITY_ROADMAP.md" ||
    fail "a pnpm advisory should carry its severity into the roadmap"
else
  fail "a pnpm package with a usable audit report should publish the roadmap"
fi

# A workspace member has no lockfile of its own because the workspace root
# holds it. Demanding one from the member would hold the roadmap open forever
# on a package whose dependencies are already audited at the root.
workspace_fixture="$(new_pnpm_fixture pnpm-workspace "$pnpm_advisory_stub")"
mkdir -p "$workspace_fixture/ventures/demo/packages/member"
printf 'packages:\n  - packages/*\n' >"$workspace_fixture/ventures/demo/pnpm-workspace.yaml"
printf '{"name":"member","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
  >"$workspace_fixture/ventures/demo/packages/member/package.json"
run_scanner "$workspace_fixture" ||
  fail "a pnpm workspace member should not be reported as a missing-lockfile gap"
grep -q 'covered by its pnpm workspace lockfile' "$workspace_fixture/stdout.log" ||
  fail "a pnpm workspace member should say why it was not audited separately"

# The exemption is the workspace root's to give. A package outside any
# workspace that ships no lockfile must still be a gap, or adding a stray
# pnpm-workspace.yaml anywhere above would disarm the requirement wholesale.
outside_fixture="$(new_pnpm_fixture pnpm-workspace-scope "$pnpm_advisory_stub")"
mkdir -p "$outside_fixture/ventures/orphan"
printf '{"name":"orphan","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
  >"$outside_fixture/ventures/orphan/package.json"
printf '%s\n' "$recorded_row" >"$outside_fixture/SECURITY_ROADMAP.md"
if run_scanner "$outside_fixture"; then
  fail "a lockfile-less package outside the workspace should exit non-zero"
fi
grep -qF "$recorded_row" "$outside_fixture/SECURITY_ROADMAP.md" ||
  fail "a lockfile-less package outside the workspace must not overwrite findings"

# --- Discovery completeness -------------------------------------------------
#
# The cases above all check what happens to a package the scanner *reached*. The
# incident on 2026-08-05 came from the other side: `SECURITY_ROADMAP.md` was
# rewritten with `1 package(s) audited`, `HIGH: 0` and a single
# `All Components | None | CLEAN` row, over a repository holding 23 HIGH
# advisories. Nothing failed. Every package the walk found audited cleanly, and
# the guard's only floor was `AUDITED_COUNT -eq 0`, so "all of the packages we
# found" passed for "all of the packages". A denominator is the fix, and these
# cases are what hold it in place.

# A scan root that is not there enumerates nothing, and nothing is
# indistinguishable from clean once the walk's stderr is discarded.
missing_root_fixture="$(new_fixture missing-scan-root "$(audit_json 0 0 0 '{}')" lockfile)"
printf '%s\n' "$recorded_row" >"$missing_root_fixture/SECURITY_ROADMAP.md"
rmdir "$missing_root_fixture/platform"
if run_scanner "$missing_root_fixture"; then
  fail "a missing scan root should exit non-zero"
fi
grep -qF "$recorded_row" "$missing_root_fixture/SECURITY_ROADMAP.md" ||
  fail "a missing scan root must not overwrite the recorded findings"
grep -q 'scan root does not exist' "$missing_root_fixture/stderr.log" ||
  fail "a missing scan root should be named as the reason"

# The general form: a manifest git tracks that the walk never handed to the
# auditor. Reproduced as a partial checkout — the manifest is in the index but
# not on disk — which is the realistic way a run ends up auditing a fraction of
# the repository while every package it did find comes back clean.
#
# Note the prune list is deliberately applied to both enumerations, so a
# manifest under `dist/` is absent from the expected set as well and is not a
# finding. The two sides must agree on scope, or the reconciliation would report
# every vendored copy as a gap and the guard would never clear.
unreached_fixture="$(new_fixture unreached-manifest "$(audit_json 0 0 0 '{}')" lockfile)"
printf '%s\n' "$recorded_row" >"$unreached_fixture/SECURITY_ROADMAP.md"
mkdir -p "$unreached_fixture/ventures/absent"
printf '{"name":"absent","version":"1.0.0","dependencies":{"left-pad":"^1.0.0"}}\n' \
  >"$unreached_fixture/ventures/absent/package.json"
git -C "$unreached_fixture" add -A >/dev/null 2>&1
rm -rf "$unreached_fixture/ventures/absent"
if run_scanner "$unreached_fixture" keep-index; then
  fail "a tracked manifest the walk never reached should exit non-zero"
fi
grep -q 'never reached by package discovery' "$unreached_fixture/stderr.log" ||
  fail "an unreached manifest should say that discovery missed it"
grep -qF "$recorded_row" "$unreached_fixture/SECURITY_ROADMAP.md" ||
  fail "an unreached manifest must not overwrite the recorded findings"

# Without a repository there is no expected set, so the walk's result cannot be
# checked against anything. That is precisely the state the CLEAN dashboard was
# published from, and it must fail closed rather than trust the walk.
ungit_fixture="$(new_fixture no-git-worktree "$(audit_json 0 0 0 '{}')" lockfile)"
printf '%s\n' "$recorded_row" >"$ungit_fixture/SECURITY_ROADMAP.md"
rm -rf "$ungit_fixture/.git"
if run_scanner "$ungit_fixture"; then
  fail "a scan outside a git work tree should exit non-zero"
fi
grep -q 'not a git work tree' "$ungit_fixture/stderr.log" ||
  fail "a scan outside a git work tree should say the discovery was unverifiable"
grep -qF "$recorded_row" "$ungit_fixture/SECURITY_ROADMAP.md" ||
  fail "a scan outside a git work tree must not overwrite the recorded findings"

if [ "$failures" -ne 0 ]; then
  printf 'security-scan contract tests failed: %d\n' "$failures" >&2
  exit 1
fi

printf 'security-scan contract tests passed\n'
