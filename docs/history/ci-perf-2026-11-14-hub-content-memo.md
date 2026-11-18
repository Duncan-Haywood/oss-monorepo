# CI perf 2026-11-14: the hub extracts each post once, not nine times

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so this run took a fresh pool reading and the top item of
the previous run's "not changed" list
(`ci-perf-2026-11-14-icon-memo-unwired-pool.md`, item 1).

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-14 16:16Z to
17:07Z): 548 jobs, 503.2 job-minutes, checkout 200.6. ventures tests: 23
jobs, 48.2 min, heaviest step "node --test in each touched venture" (27.3
min). Since 2026-11-13 that step also runs `unwired_checks.run_everything()`
on every PR, and `platform/distribution/hub/content.test.mjs` is one of the
node suites in it (no PR workflow runs it; PR #15201 proposes wiring it into
distribution-versions-ci, which would not take it out of the pool's path
until it lands).

## Profile

`node --test platform/distribution/hub/content.test.mjs` on an idle 4-core
container: **14.5 s and 12.8 s wall**, of which the test "every real post:
kits quote the post verbatim and fit every limit" took 13.5 s and 11.8 s.
It builds a kit and the eight draft-platform variants for each of the 4,549
posts in `docs/posts/`.

A scratch script doing the same loop under `node --cpu-prof` (self time
summed per function, 20.2 s under profiler): `norm` 4.7 s, `glen` 2.7 s,
`plain` 2.1 s, the housekeeping regex 1.6 s, GC 1.2 s. All of it under
`extract()`.

Two causes:

1. **`contentOf(item)` called `extract()` every time.** `kit()` asks once and
   each of the eight RICH variants (x, linkedin, substack, medium, tiktok,
   youtube, reddit, hackernews) asks again, so each post was extracted nine
   times. `hub.mjs` builds plans the same way, so the production hub run paid
   it too.
2. **`isDup` normalised both strings on every comparison**: `norm(description)`
   once per candidate sentence and `norm(k.s)` for every kept point per
   candidate.

## Change

- `compose.mjs`: `contentOf` remembers `extract()`'s result in a `WeakMap`
  keyed on the item, checked against the body and description it was computed
  from (a changed item is extracted again). It still returns a fresh object
  with fresh arrays per call, so no caller can see another caller's edits.
- `content.mjs`: `extract` normalises each usable sentence once (`x.n`) and
  compares normalised strings. `norm` is idempotent (lower-case, runs of
  non-alphanumerics to one space, trim), so comparing against `descKey` as is
  equals the old `norm(descKey)`.
- `compose.mjs` `clip`: returns early when the string's UTF-16 length is
  already within `max`. A string never has more graphemes than UTF-16 units,
  so the answer is the same without running `Intl.Segmenter` over a whole
  post (the Medium and Substack variants clip the full body).

## Verification

- A scratch golden script wrote `JSON.stringify(kit(item))` and
  `JSON.stringify(variant(item, platform))` for every post and every platform
  in `PLATFORMS`: 86,431 lines. Before and after: `cmp` identical, after each
  of the two steps.
- `node --test platform/distribution/hub/*.test.mjs platform/distribution/*.test.mjs`:
  264 pass, 0 fail.

## After

`node --test platform/distribution/hub/content.test.mjs`, same container:
**4.55 s, 4.50 s, 4.55 s wall** (memo and norm alone: 5.48 s, 5.57 s). The
profiled loop went from 20.2 s to 3.8 s. Saving about 8 to 10 s of CPU on
every ventures-tests job; how much of it shows in the step's wall time
depends on whether this suite was the node phase's longest item (android.test
was, before #15891).

## Not changed, ranked for the next run

1. **`glen` is still the top self time** (1.3 s of 3.8 s profiled): the
   grapheme segmenter over non-ASCII sentences in `extract` and `thread`.
   Memoising `glen` per string would help; left alone because the remaining
   cost is now mostly the test's own loop.
2. **`test_concurrency_tax.py`** (15.9 s) and **`check_calendar_dates.py`**
   (11.7 s), unprofiled, from the previous run's list.
3. **`platform/ci/test_run_workflow_locally.py`** (9.2 s, in every Portfolio
   validate job): spread over 176 tests; the two budget tests spend 1 s each
   on deliberate timeouts. No single lever.
4. P063 and P064 remain owner-gated (workflow files).
