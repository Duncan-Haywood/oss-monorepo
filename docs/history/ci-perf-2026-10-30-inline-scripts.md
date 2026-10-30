# Inline-script check: one node process, not 1,647 (2026-10-30)

**Reading.** `docs/history/ci-perf-2026-10-30-guard-checkouts.md` ranked
"Check inline scripts parse" (Portfolio validate, 24.6 job-minutes in the
sampled window) as the pool's largest single step. `check_inline_scripts.py`
spawned `node --check` once per inline script: 1,647 scripts.

**Before.** `time python3 platform/ci/check_inline_scripts.py`: 52.4 s real
(29 s user, 16 s sys), 4-core container, exit 0.

**Change.** One `node -e` process screens every script (`vm.Script`, or
`vm.SourceTextModule` for modules). Anything it rejects is re-run through
`node --check`, so verdicts and messages stay those of `node --check`.
`vm.Script` is no looser than `node --check` (it rejects a top-level `return`
the CommonJS wrapper accepts; the fallback absorbs that). If the batch process
fails, every script goes through `node --check`, as before.

**After.** Same command: 1.8 s real, exit 0, no output. Unit tests (5 existing
plus a new one pinning top-level `return`, a valid module and a bad module
among good scripts) pass.

**Not changed, ranked.** Other Portfolio validate steps that spawn a process
per file (grep for `subprocess.run` in `platform/ci/check_*.py`); the sibling
links and README live-links checkouts (guard-checkouts doc, part 2).
