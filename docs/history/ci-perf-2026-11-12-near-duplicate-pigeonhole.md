# Perf: ShootFlow near-duplicate grouping, all pairs to a pigeonhole index (2026-11-12)

Perf track run (`prompts/perf/prompt-0.md`). Both open perf backlog items
(P063, P064) are owner-gated, so this run went to step 3: the slowest local
step a session waits on, here the `photo-editing` test suite.

## Reading

- `photo-editing CI`, runner pool reading (`ci_profile.py --runs 300`): 10 jobs,
  11.0 job-minutes in a 30-minute window; heaviest step the unittest run.
- Local suite: 735 tests, 53.4 s wall in this container (one pre-existing error:
  the system Pillow has no `_imaging`; numpy absent, so 32 tests skip, as on CI).
- Per-test timing (a `TextTestResult` subclass timing each test): 25 of the
  53 s is `test_ffmpeg_pipeline`, and all of that is real ffmpeg encodes (each
  subprocess timed: proxies, ProRes masters, reels). The engine there is ffmpeg, not
  our code; nothing to change without weakening what the tests check.
- `test_analysis ... ten_thousand_analysis_records` (3.6 s) led to
  `load_asset_analyses`, and from there to the real cost: `group_near_duplicates`
  compared **every pair** of photo dHashes. Its test fixture has no hashes, so
  the suite never saw it. Every real photo the pipeline analyses gets a
  hash (`production_adapter.py`, `"perceptual_hash": metrics.dhash`), so a real
  shoot pays n²/2 Hamming distances in the story step.

## Before and after

`group_near_duplicates` alone, synthetic shoot (40% burst frames, each 0 to 10
bits from the previous frame, rest random 64-bit hashes, shuffled), one run each,
this container; the old code was loaded from `git show HEAD:` into a scratch
copy of the package:

| photos | before | after | output digest (both) |
|---|---|---|---|
| 1,000 | 0.383 s | 0.008 s | 45d5e846d5233509 |
| 4,000 | 5.419 s | 0.051 s | 6babe4c113175302 |
| 10,000 | 34.270 s | 0.435 s | d1415eecf42d1b37 |
| 20,000 | 138.941 s | 0.912 s | fac87faba1f2a421 |

The digest is sha256 over the `(asset_path, scene_label)` list returned, so
the labels are the same, entry for entry.

## Change

`ventures/photo-editing/src/shootflow/analysis.py`:

1. Identical hashes are joined first; the search runs over distinct values only.
2. Pigeonhole index: the hash bits are cut into `NEAR_DUPLICATE_MAX_DISTANCE + 1`
   = 9 disjoint blocks. Two hashes at most 8 bits apart agree exactly on at
   least one block, so only hashes sharing a block value are compared. Exact,
   not approximate. With fewer bits than blocks, the empty blocks match every
   pair, so it stays exact for any hash width.
3. `int.bit_count()` for the popcount (the project targets Python 3.10).

Why the output cannot change: the edges are the same (every pair within 8 bits),
and the union rule makes the smaller index the root, so each group's root is its
first member by asset path whatever order the pairs are found in.

## Verification

- New test `test_indexed_grouping_matches_the_all_pairs_scan`
  (`tests/test_frame_analysis.py`) pins the new path against a plain all-pairs
  reference on 11 shoots: burst-heavy, all identical frames, 4- and 8-bit hashes,
  upper-case hex, distances of exactly 8 and 9. Mutation check: cutting 8 blocks
  instead of 9 (no longer exact) fails it.
- Full suite: 736 tests, 53.1 s, the same single pre-existing Pillow error.
- `mypy`: no issues. `ruff check .` with the pinned ruff 0.15.8: all checks
  passed. (An unpinned ruff 0.16.9 earlier on `PATH` reported 160 findings
  on main too; use the CI pin.)

## Not changed, ranked for the next run

1. `test_ffmpeg_pipeline` (25 s): real encodes. Clips with an audio track
   transcode about 5x slower than silent ones at this size (46 s AAC sine:
   proxy 2.0 s vs 0.36 s). A shorter fixture audio track might help, but
   check first what each test needs the audio for.
2. `load_asset_analyses` per-file checks (about 1.9 s per 10k files):
   `_safe_workspace_path` and `_reject_symlink_path` resolve the workspace root
   again for each file. Resolving it once is a small, safe win, but these are
   security checks: keep the per-file `resolve()` of the file itself.
3. The CI command runs `unittest discover` serially on a 4-core runner; a parallel
   runner would be a workflow (CODEOWNERS) change.
