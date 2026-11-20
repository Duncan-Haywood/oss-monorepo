# photo-editing: status writes validate the trusted plan once, not 14 times; 0.89 s to 57 ms per write on a 2,000-photo shoot (2026-11-20)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took step 3 (the slowest local step a
session waits on), and the profile turned up a cost users pay as well.

## Reading

- `suite_file_times.py ai-bookkeeper`: 350 files, 84.6 s summed, no file over
  2.8 s. Flat, nothing to take.
- `pytest tests/test_ffmpeg_pipeline.py --durations=8` (photo-editing, the
  slowest module named in `ci-perf-2026-11-19-league-bowling-walk-flat.md`):
  19 tests, 28.5 s. `test_selected_grade_scope_...` 8.6 s,
  `test_dng_still_is_developed_...` 7.3 s.
- `python3 -m cProfile` over the DNG test: most of the 7.3 s waits on ffmpeg
  (`select.poll`), but `production_status.compare_and_write_production_job_status`
  was 1.9 s cumulative, nearly all of it `_trusted_jobs_by_id` ->
  `_validate_trusted_job` -> `_validate_path_tuple` building a `pathlib.Path`
  for every input and output of every job in the plan.

## Why it grew with the shoot

One status write (`compare_and_write_production_job_status`) loads the manifest,
replaces one job's status and writes it back. Each of those steps calls
`_validate_manifest`, which calls `_validate_trusted_plan`, then
`production_plan_fingerprint` (which validates the plan again before hashing
it), then `_trusted_jobs_by_id` once more. `_replace_production_job_status`
validates both the old and the new manifest. Counted under the profiler: 273
full-plan validations for 20 writes, about 14 per write, each one O(jobs). A
shoot writes at least two statuses per job (running, then succeeded), so status
bookkeeping alone was O(jobs^2).

Bench (`build_production_plan` on N photo assets, 20 `pending -> running`
writes, mean per write; `ventures/photo-editing/tools/bench_status_writes.py`):

| assets | jobs | before ms/write | after ms/write | speed-up |
|---:|---:|---:|---:|---:|
| 100 | 305 | 44.1 | 3.3 | 13x |
| 500 | 1,505 | 232.1 | 13.5 | 17x |
| 2,000 | 6,005 | 889.7 | 56.7 | 16x |

At two writes per job that is about 3 hours of status bookkeeping on a
2,000-photo shoot before, about 11 minutes after. What remains is linear per
write: reading, validating and rewriting the whole JSON manifest.

## Change

`src/shootflow/production_status.py`: `_validated_plan(plan)` validates a
trusted plan once per plan object and keeps its `jobs_by_id` and (lazily, on
first use, as before) its fingerprint. `_validate_trusted_plan`,
`production_plan_fingerprint` and `_validate_manifest` read from it.

- A `ProductionPlan` is a frozen dataclass whose `jobs` is a tuple of frozen
  dataclasses holding strings, tuples and a frozen `DeliverableSpec`, so the
  same object validates the same way every time.
- An entry is keyed by `id(plan)` and used only while its weak reference still
  points at that very object and the object still holds the same `shoot_slug`
  and `jobs` tuple. The weak-reference callback drops the entry when the plan
  is collected, so the table holds only live plans.
- A plan that fails validation is never cached: it raises the same error on
  every call. An equal but distinct plan object is validated on its own.
- The fingerprint stays lazy, so a plan that validates but cannot be
  fingerprinted fails at the same call as before.
- Manifest validation (per status, dependency states) still runs on every load,
  replace and write: the manifest is read from disk and is not trusted.

## Verification

- Differential check, old module (saved copy) against new, 204 comparisons:
  plans of 1, 3, 40 and 200 mixed photo/video assets, the fingerprint and the
  manifest bytes after 15 writes byte-identical; ten invalid plans (`None`, a
  string, blank slug, list of jobs, duplicate job, `../` input, absolute
  output, unknown dependency, self-dependency, `can_run_in_parallel=1`) give
  the same exception type and message from `production_plan_fingerprint`,
  `build_initial_production_status_manifest` and a full init-and-write run,
  each called twice. After `gc.collect()` the cache is empty.
- Two new tests in `tests/test_production_status.py`: a plan is validated once
  across an initialisation and three writes, and again for an equal copy; an
  invalid plan is rejected on each of three calls.
- `python3 platform/ci/run_venture_tests.py photo-editing`: ok, 1,467 tests
  (10 skipped), 212.0 s. `test_production_status.py` 16 passed.
- In the suite: `test_dng_still_is_developed_...` 7.3 s to 5.3 s,
  `test_ffmpeg_pipeline.py` 28.5 s to about 26 s (the rest is ffmpeg).

## Not changed, ranked for the next run

1. **The manifest itself is O(jobs) per write**: 57 ms per write at 6,005 jobs
   is reading, validating and rewriting the whole `production_status.json`.
   A per-job status file or an append-only log would make a write O(1), but it
   changes the on-disk format other tools read (`workspace_index`,
   `workspace_health`, `production_handoff`), so it needs a schema version and
   a migration.
2. `test_ffmpeg_pipeline.py` is still ~25 s, almost all ffmpeg encodes of the
   fixtures; the 46 s 1280x720 takes in the grade-scope test are what the
   storyline rules need (45 s variants must not fit).
3. `_validate_path_tuple` builds a `pathlib.Path` per value; a string check
   (`os.path.isabs`, split on `/`) would be cheaper, but it now runs once per
   plan, so it no longer matters.
4. P063 and P064 remain owner-gated.
