# Red Pages build after isolation-forest, and a duplicate chant-forge pass (2026-11-13)

Perf track, prompt 0. This run ended up landing a fix for a red `main`; its
perf change was already on `main` from another session.

## What happened

1. **Reading.** Both open perf backlog items (P063, P064) are owner-gated, so
   the run swept every venture suite (`run_venture_tests.py --slowest 40
   --no-elsewhere`, 4 cores, 1,346 suites, 0 failed). After the six suites with
   earlier passes came chant-forge (82.7 s), where `render.test.mjs` took
   68.6 s and `truePeak` (master.mjs) was 29 s of CPU self time.
2. **A fix, written and verified, then found duplicated.** Skipping 64-sample
   blocks whose bound (local max |x| times the sum of |tap| for each phase) is
   at most the sample peak cut the render bench from 50.3 s to 17.2 s, with
   the same WAV and stems hash (`bfa129428bcba63d`). While this run's PR
   (#15448) waited on CI, PR #15446 from another session merged the same idea
   (a single bound for all phases, checked per sample). On the same bench,
   #15446's version renders in **15.8 s** with the same hash, slightly faster
   than this run's 17.2 s. This run's code change was dropped; `main` keeps
   #15446.
3. **Red main.** PR #15448's Pages build failed on a file the PR did not touch:
   `isolation-forest/data/breast-cancer-wisconsin.data: nothing says how the
   site should type ".data"` (`platform/pages/check.mjs`,
   `checkServedExtensions`). PR #15447 (isolation-forest) had merged a few
   minutes earlier with UCI benchmark fixtures named `*.data`. Every PR and
   the scheduled deploy fail that check until it is fixed.

## Change

`platform/pages/check.mjs`: `.data` joins `SERVED_EXTENSIONS` as `'stock'`,
with a comment. The files are comma-separated text that isolation-forest's
tests read. Its page never fetches them (`grep '\.data' index.html
example-data.mjs` finds only `el.dataset`). mime-db has no `.data` entry, so a
visitor who opens one directly downloads it, which is harmless for a fixture.
The same reasoning admitted `.service` on 2026-11-11 after PR #14794.

A second failure from the same PR showed up once the build was green:
`percent-float.test.mjs` flagged `${p.contamination * 100}%` in
`ventures/isolation-forest/index.html`. It printed correctly for today's
options (1, 2, 5, 10%), but it now rounds as the rule asks:
`${+(p.contamination * 100).toFixed(4)}%`.

## Verification

- `checkServedExtensions(['isolation-forest/data/breast-cancer-wisconsin.data', 'a/x.foo'])`
  reports only `.foo`.
- `node --test platform/pages/check.test.mjs`: pass.
- Full build and check from this tree: `node build.mjs --out=<dir>` exit 0 (1,349 tools), then `node check.mjs <dir>` exit 0, the step that failed on #15448's first head.

## For the next run

- **Why #15447 merged red:** its own PR checks should have run the Pages build.
  If they did not, the trigger paths for `portfolio-pages.yml` may skip a
  `ventures/<slug>/data/` change. That is a workflow file (owner-gated), so it
  is only noted here.
- **Duplicate perf passes:** two sessions picked chant-forge from the same
  sweep within the hour. A perf run can search open *and just-merged* PRs
  for the venture slug right after choosing a target, not only at PR time.
  This run searched open `perf` PRs before the sweep, not after it.
- The chant-forge "not changed" list still stands: the limiter loop's up to 8
  passes each run a full `integratedLufs` and `limiterCurve`.
