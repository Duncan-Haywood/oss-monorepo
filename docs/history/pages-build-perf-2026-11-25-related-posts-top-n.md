# Pages build, 2026-11-25: related posts keep a top 5 instead of sorting every candidate (buildWriting 12.2 s to 7.6 s)

Perf track, version 0. Took item 3 of the prompt ("the slowest local step an
agent session waits on"). Why not items 1 and 2:

- **P063** (ventures-tests sparse checkout) no longer holds up.
  `.github/workflows/ventures-tests.yml` is not in the owner-only `priv-*`
  core, so it could land, but since 2026-11-13 the job's
  `run_venture_tests.py --since` step also runs `unwired_checks.py`: 79
  check scripts, 144 `platform/ci` suites, 18 portfolio suites and 55
  platform node suites (`unwired_checks.py --list`, 2026-11-25). Many of
  them read every venture (`test_venture_sweeps.py`,
  `venture-yaml-readers.test.mjs`, the `platform/distribution` suites). A
  sparse checkout would make them scan fewer files, or break them, and the
  job would still go green. That is a weakened check. Four open PRs from
  2026-11-09 (PR #13748, #13868, #14240, #14251) carry the old change, and
  none of them handles this. PR #18954 adds the same caution to the P063
  row.
- **Pool reading** (`ci_profile.py --runs 300 --top 20`, 2026-11-25 12:07
  UTC, 349 jobs, 484.8 job-minutes, 174.5 of them checkout): the
  checkout-bound jobs are `priv-*` (Security gate, CI policy, Conflict
  markers) or read the whole tree on purpose (agent-permission-harness
  measures the repository's prose). The largest non-CodeQL step is Portfolio
  Pages "Test the site builder" (45.4 job-min over 52 jobs). PR #18954, open
  from another run, works on that step's card cache in the workflow. This
  run took the build code the step runs, which is not a workflow edit.

## Reading

Ran the whole Pages suite on a 4-core sandbox with a cold card cache
(`node --test --test-reporter=tap "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`). It took **431 s wall** (`time`), with 2,093 of 2,093 tests
passing. Per-test durations from the TAP output:

| test | s |
|---|---:|
| first test awaiting the shared build (`build.test.mjs`) | 336.1 |
| `a custom-domain build leaves no reference to the default origin` | 77.2 (46.5 alone) |
| `no blog post skips a heading level` | 17.1 |
| next ones | 12.2 or less |

The custom-domain test builds the whole non-venture site (writing, research,
offline bundles) around a two-venture fixture: 10,068 files, 406 MB. A suite
run does four such full builds: the shared build, its determinism child, the
hub fixture and this one. A deploy does one more. So a cost in the
non-venture passes is paid five times.

Phase timestamps on a throwaway copy of `buildSiteInner` (a `console.error`
after every top-level statement) for the custom-domain fixture build, 34 s
total:

| phase | s |
|---|---:|
| `buildWriting` | 10.75 |
| `addOfflineSupport` | 8.61 |
| pass-2 HTML finish (`finishPagesInOneWalk`) | 6.95 |
| `await researchBuild` (Python research builder, idle on the JS side) | 2.94 |
| `addModulePreloads` | 0.89 |

A `node --cpu-prof` of the same build put 12.2 s under `writeSection`
(`writing.mjs`). Of that, 9.1 s was `writeFileSync` (215 MB across 7,772
writing pages, so the sandbox's disk) and 2.5 s was
`relatedPosts` → `balancedRelated` → `rankRelated`.

`rankRelated` already uses an inverted index (2026-11-12). What remained per
post:

1. a `Map` of scores holding every post that shares a tag or title word with
   it (up to a fifth of all posts per term, about 1,470 of 7,369), and
2. a full sort of all those candidates, then `slice(0, 5)`.

Run over all 7,369 posts (scratch script that calls `relatedPosts` and
`rankRelated(…, 20)` for every post and hashes the lists): **2.3 to 2.5 s**
each, 3 runs.

## Change

`rankRelated` in `platform/pages/writing.mjs`:

- Scores go in a `Float64Array` that the related index keeps. The function
  zeroes it again before it returns, and a `touched` list replaces the
  `Map`. Every weight added is positive, so 0 means "not scored". Each index
  gets the same additions in the same order as before, so every score is the
  same double.
- The top n are kept in a small sorted array as candidates arrive, using the
  same comparator (score, then nearest date, then index). The index breaks
  every tie, so the comparator is a total order and the result is exactly
  the first n of a full sort.

The fill path (a post with fewer than n scored candidates) is unchanged.

## Verification

- **Same lists:** the hash of every post's `relatedPosts` list and
  `rankRelated(…, 20)` list over all 7,369 real posts is `284f58be370e57da`
  before and after.
- **Same site:** the custom-domain fixture build was run with the old and the
  new `writing.mjs` and the outputs compared with `diff -rq` (10,068 files).
  Only `version.json` and `feed.xml` differed, and only in their build
  timestamps (`built_at`, `<updated>`).
- **New test** in `writing.test.mjs`: "rankRelated keeps the n best of the
  full ranking, ties included, and leaves no score behind". It uses 90
  synthetic posts with many equal scores and dates and checks that each
  n-list is a prefix of the full ranking and that a second pass in reverse
  order gives the same lists. It passes on the old code too, so it pins the
  old behaviour. It fails when the buffer reset is removed. Dropping the
  date tie-break is caught by the two existing ranking tests, not by this
  one.
- `writing.test.mjs` and `writing-backlog.test.mjs`: 68 of 68 pass (69 with
  the new test). Whole suite after: 2,093 of 2,094. The one failure was the
  determinism test, which flagged this doc being written under `docs/` during
  the run. `build.test.mjs` re-run with no edits: 339 of 339.

## After

| measure | before | after |
|---|---:|---:|
| `relatedPosts` over all posts (3 runs) | 2.31 / 2.47 / 2.49 s | 0.54 / 0.64 / 0.61 s |
| `buildWriting` alone into a temp dir (3 runs each) | 11.37 / 12.16 / 13.51 s | 7.60 / 7.28 / 8.69 s |
| Whole Pages suite, cold card cache, 4 cores (one run each, noisy) | 431 s | 406 s |

`buildWriting` takes the related tables for more than one post list (the
blog, then the lists `siblingTargets` grows), so it saves more than the
single-list timing suggests. The suite has four full builds, so that is
about 4 × 4.5 s of CPU, spread over its four cores.

## Not changed, ranked for the next run

1. **`await researchBuild` idles 2.9 s in fixture builds.** The Python
   research builder (`research/_homepage/build.py`, 2.6 s, spread across
   `project_page`) is awaited before the link repairs. The comment there
   ("Pass 1 takes minutes") has been out of date since the parallel copy of
   2026-11-11. In the full build the copy hides most of the wait. In the two
   small-fixture builds per suite it does not. Starting a research-independent
   pass before the await would need an audit of which passes read `research/`.
2. **Writing pages are 215 MB of `writeFileSync`** (9.1 s in this sandbox).
   That is disk speed. Making the pages smaller would change the output.
3. **`addOfflineSupport` 8.6 s** and the pass-2 finish at 7 s are the next
   CPU phases. The earlier passes (2026-11-12 to 11-20) took the easy parts.
4. **P063** should be closed as "unsafe since the unwired checks" (above),
   along with its four stale PRs. That needs a backlog edit and PR closures
   that the open PR #18954 has already started on.
