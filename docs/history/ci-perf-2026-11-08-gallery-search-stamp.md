# Perf reading, 2026-11-08: the gallery search stamp is never cached in CI

Perf track. No code change shipped: the fix is in `.github/` (CODEOWNERS), so it
is filed as backlog item P064 beside P063.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (586 jobs, 614 job-minutes):

| workflow | job-min | note |
|---|---:|---|
| Portfolio Pages | 320.6 | `Test the site builder` alone is 198.5 min, median 482 s |
| Portfolio validate | 84.4 | no step over 3 min in total |
| ventures tests | 72.4 | checkout 16%; P063 covers it |

`--steps 15` shows the one non-test step in the Pages build job that nobody has
worked on: `Search the Shed Designer gallery` at 19 s median, 10.3 job-minutes.

## Profile

`node ventures/shed-designer/make-gallery.mjs`: 25.7 s wall (36 s user) on a
cold checkout. A repeat run skips the search because of `.gallery-stamp`
(a hash of the engine sources and data), and exits at once. The stamp is
gitignored, so each fresh runner searches again even when no input changed.

## Proposed change (P064)

Cache the stamp on the input hash, or skip the step when `--check` passes.
Expected saving: about 19 s of 54 s typical in the build job's heavier steps.
Not shipped here because a workflow edit waits for the owner.

## Not changed (ranked)

1. `Test the site builder` (482 s median) stays the largest consumer. The earlier
   passes (`pages-test-perf-2026-11-0*`) ruled out overlap and per-test fixes;
   the remaining lever is a real share-card cache hit in CI.
2. P063: sparse checkout for ventures tests (22.7 s per job).
3. `Check the built artifact` at 26 s median in the build job.
