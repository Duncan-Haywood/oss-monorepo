# CI perf, 2026-11-12: photo-editing's 46 s fixture audio, and the analysis loader's root

Perf track. Both open backlog perf items (P063, P064) touch
`.github/workflows/` (CODEOWNERS, owner-only), so this run took items 1 and 2
of "Not changed" in
[`ci-perf-2026-11-12-near-duplicate-pigeonhole.md`](ci-perf-2026-11-12-near-duplicate-pigeonhole.md):
the `photo-editing` suite (`photo-editing CI`: 8 jobs in the last 300 runs,
`ci_profile.py --runs 300`).

## Reading (before)

Every test timed in one process (a `TextTestResult` that records
`startTest`/`stopTest`, `PYTHONPATH=src`, this 4-core container): 45.7 s in
all. Slowest: `test_selected_grade_scope_masters_only_the_picked_clip` 8.6 s,
the DNG and CR2 development tests 3.8 s and 3.7 s, the unattended-run test
3.5 s, `test_loads_ten_thousand_analysis_records_without_dropping_story_inputs`
3.1 s.

### The 8.6 s test

Every ffmpeg child timed (a `subprocess.Popen` subclass that logs wall time
per command). A001's proxy took 1.64 s against A002's 0.29 s; the only
difference is A001's 46 s AAC sine track. Split out: the proxy's video alone
0.28 s, its audio alone 1.44 s. ffmpeg's native AAC encoder runs at about 32x
real time here (`-aac_coder fast` only gets 1.35 s to 1.03 s, so not worth a
product change for a 96 kb/s review proxy). The fixture's audio exists only so
the two takes are different files; nothing in the test reads it, and the
duration the planner sees is the container's (the `Duration:` banner, the
longest stream), which stays 46 s with a 1 s track (checked with `ffmpeg -i`).

### The loader

`cProfile` of the 10k-record test: 50,000 `Path.resolve` calls (1.8 s of 5.8 s
under the profiler), five per file. Two of the five re-resolved the workspace
root: once in `_safe_workspace_path`, once at the top of `_reject_symlink_path`.

## Change

- `tests/test_ffmpeg_pipeline.py`: A001's fixture audio is `sine=duration=1`
  instead of 46 s, and `-shortest` is dropped (with it the video would be cut
  to 1 s). The comment says why.
- `src/shootflow/analysis.py`: `load_asset_analyses` resolves the root once
  and passes it to both helpers through a new keyword-only `resolved_root`
  (default `None`, the old behaviour, so every other caller is unchanged).
  The file itself and each parent up to the root are still resolved and
  checked per file: the security checks are the same, only the root's
  repeated resolution is gone.

## Verification

- `load_asset_analyses` on one 10,000-file workspace, five calls each, old and
  new `analysis.py` (`git stash`): `sha256(repr(result))` identical
  (`3bc2c557aaadb2b0`) both times.
- `python3 platform/ci/run_venture_tests.py photo-editing`: `ok photo-editing
  (98.8s) incl. Python steps of photo-editing-ci.yml`.
- `PYTHONPATH=src python3 -m unittest discover -s tests` (the CI command): 749
  tests, 34 skipped, before and after. The one error both times is
  `test_real_photo_calibration`'s `from PIL import Image` failing on this
  container's broken system Pillow (`cannot import name '_imaging'`), not a
  code issue; the venture runner's interpreter passes it.

## Numbers

Same container, nothing else running.

| | before | after |
|---|---|---|
| `test_selected_grade_scope...` (3 runs, `python3 -m unittest <id>` wall) | 9.03 / 8.65 / 8.62 s | 6.92 / 6.86 / 6.81 s |
| `load_asset_analyses`, 10k files (median of 5, two runs) | 1.44 / 1.43 s | 1.17 / 1.30 s |
| whole suite, back to back (`unittest discover` wall) | 49.9 s | 47.1 s |

About 1.8 s off the slowest test (21%) and roughly 3 s (6%) off the suite;
the loader change also shortens a real load of a 10k-photo shoot by about
a fifth.

## Not changed, ranked for the next run

1. **Prores grades of the two 1280x720 fixture clips** (1.17 s and 1.75 s of
   the 6.9 s test). The test needs the full master wider than the 960 px review
   grade; a 1000x562 fixture would keep that and roughly halve the encode, but
   check `_probe(full)["width"] == 1280` and anything else reading the size.
2. **Two reel encodes per run** (0.74 s each, `instagram_reel` and
   `instagram_reels/hero`) render the same selection at the same settings
   in this fixture; whether the product could encode once and copy depends on
   whether the hero cut can differ from the reel cut (read `story.py`).
3. The DNG/CR2 development tests (3.7 to 3.8 s) are mostly waiting on child
   processes (`cProfile`: 2.2 s in `lock.acquire`, 1.2 s in `poll`); profile
   the children before touching the Python.
4. The CI command still runs `unittest discover` serially on a 4-core runner;
   a parallel runner would be a workflow (CODEOWNERS) change.
