---
kind: note
date: 2026-11-14
topics: [redteam, ci]
---
# Test spawns without a cwd; fractional shift lengths (redteam, 2026-11-14)

**State after this run.** `platform/ci/check_test_spawn_cwd.py` fails on any
`*.test.{mjs,cjs,js}` under ventures/, platform/, research/ or portfolio/ that
runs `node <relative script>` (execFileSync/execFile/spawnSync/spawn with
`process.execPath` or `"node"`, `fork("x.mjs")`, `execSync("node x.mjs")`)
with no `cwd` in the call. The tree is clean (about 2 s). No workflow names
it, so `unwired_checks.py` runs it on PRs that reach `run_venture_tests.py
--since` (ventures/** PRs; see the open 2026-11-13 entry about widening those
paths).

Why it matters to the next red-team run: `redteam.py campaign` runs a venture
suite as `node --test ventures/<slug>/**/*.test.mjs` from the repository root.
A test that spawns `cli.mjs` with no cwd passes from the venture's folder and
fails from the root, and the campaign then refuses to start ("baseline is
red"). shift-roster-builder's import-site-wages.test.mjs did this on main.

shift-roster-builder: `cutShifts` now refuses a shift length that is not a
whole number of hours. 6.5 used to loop forever under the priced cut (the
page's default with dated rows) and made phantom shifts without it. The whole
venture suite takes about 155 s from the root, which is slow for a campaign:
6 mutants with `--timeout 400`, in the background.
