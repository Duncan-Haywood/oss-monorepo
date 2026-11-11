# Pages tests: the determinism test shares the suite's build (2026-11-11)

Perf track. Takes item 1 of "Not changed" in
[`ci-perf-2026-11-10-site-tests-local-reading.md`](ci-perf-2026-11-10-site-tests-local-reading.md):
count the distinct full `buildSite` configurations the site-builder suite runs
and share any two that are the same.

## Reading

Pool reading first (`ci_profile.py --runs 600`, 11:17Z to 12:22Z): 551 jobs,
460.6 job-minutes, checkout 138.0. Portfolio Pages is the largest workflow
(197.0 min) and "Test the site builder" the largest step (108.4 min over 26
runs, median 282 s). Both open perf backlog items (P063, P064) still touch
workflow files, so they wait for the owner.

Full site builds in `platform/pages/*.test.mjs`:

| file | build | config |
|---|---|---|
| `build.test.mjs` | `site()`, in-process | real `ventures/`, `https://example.test/site/` |
| `build-determinism.test.mjs` | two child processes | the same as `site()` |
| `build.test.mjs` | `hubFixtureSite()` | two-venture fixture, `https://example.test/` |
| `custom-domain.test.mjs` | `site()` | fixture, apex origin, worker off |

So three of the four were the same build. The determinism test ("an identical
build produces an identical cache name") built the real site twice in two
children, beside `build.test.mjs`'s own build of it.

## Change

The test moved into `build.test.mjs`. It compares the cache name of the shared
in-process build with that of one child-process build. `site()` starts the
child the first time it is called, so the two builds run side by side.
`build-determinism.test.mjs` is deleted. The claim is the same, or a little
stronger. The two builds still run in different output directories and share no
module state. And the in-process build has had the rest of `build.test.mjs`
running around it, so a test that leaked state into the shared build would
now show up as a different cache name.

## Measurement

4-core sandbox, Node 22. Share-card cache warmed by one full cold run first
(11 m 19 s, as CI's restored `test-share-cards-*` cache would be).
`PAGES_CARD_CACHE` set, `node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`, bash `time`. Before and after taken in turns, three pairs,
switching the two files with `git checkout`:

| run | wall | user | sys | pass / fail |
|---|---:|---:|---:|---|
| before 1 | 286.5 s | 452.4 s | 134.8 s | 1535 / 0 |
| after 1 | 295.1 s | 390.4 s | 120.8 s | 1535 / 0 |
| before 2 | 296.4 s | 462.4 s | 146.8 s | 1535 / 0 |
| after 2 | 289.8 s | 389.9 s | 124.2 s | 1535 / 0 |
| before 3 | 284.8 s | 428.4 s | 138.2 s | 1535 / 0 |
| after 3 | 284.0 s | 378.2 s | 122.0 s | 1535 / 0 |
| **mean before** | **289.2 s** | **447.7 s** | **139.9 s** | |
| **mean after** | **289.6 s** | **386.2 s** (−14%) | **122.3 s** (−13%) | |

The test count is the same (1550, 15 skipped), because the test moved and was
not dropped. The wait for the shared build ("no test payload..." test) is
115.6 to 125.2 s before and 116.5 to 119.1 s after, the same within noise.

**Result: 79 s less CPU per run (587.6 s to 508.5 s, −13%). Wall time is
unchanged.** The step is bounded by `build.test.mjs` alone. It waits about
118 s for its build and then runs some 300 tests one after another. The
determinism builds ran on cores that file was not using. On CI a runner is a
VM of its own, so the saving does not shorten "Test the site builder" or free a
runner. It frees CPU for a local session running the suite beside other work,
and the suite is one file shorter. Measured honestly, this is a small win, not
the one the 11-10 note hoped for.

## Not changed, ranked for the next run

1. **The sequential tail of `build.test.mjs`.** About 170 s of the wall comes
   after the shared build lands (inferred: 289 s wall less the 118 s wait for the
   build, on the reading that `build.test.mjs` is the last file to finish), with
   the file running its tests one by one. Splitting `build.test.mjs` into
   files that each await one shared build would need that build to be shared
   across processes, which means building once to a fixed directory and having
   each file read it. That is the only lever left that moves wall time. Measure
   the tail first: per-test durations from `--test-reporter=tap` with
   `location`, summed.
2. P063 and P064 remain owner-gated (workflow files).
3. `hubFixtureSite()` (about 45 s warm for a two-venture fixture) spends its
   time in the hub, research and share-card work every build does whatever the
   ventures directory holds. A cheaper fixture build would help both it and
   `custom-domain.test.mjs` (about 55 s).
