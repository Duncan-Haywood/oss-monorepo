# CI perf, 2026-11-17: the research homepage walked its own tree 2,161 times

Perf track. Both open perf backlog items (P063, P064) touch `.github/workflows/`
(CODEOWNERS, owner-only), so this run went to step 3 of the perf prompt: the
slowest local step a session waits on.

## Reading

Every `platform/ci/test_*.py` module timed one at a time with `python3 -m unittest
<module>` (163 modules, 188 s in total, this 4-core container). After warming the
page cache, the top five were `test_run_workflow_locally` 10.6 s,
`test_run_venture_tests` 10.6 s, `test_research_homepage_publish` 10.3 s,
`test_adopt_stranded` 9.9 s and `test_check_storage_guard` 7.8 s.
`test_research_homepage_publish` is also the largest item in `unwired_checks.run_everything()`,
the step every ventures-tests job runs (23.7 s there on 2026-11-16,
`ci-perf-2026-11-16-research-title-index.md`), and its builder runs again in every
Portfolio Pages build.

`cProfile -s cumulative` on that module: 9.5 s of its 11.9 s is waiting on three
`research/_homepage/build.py` subprocesses. Each one builds the real site into a temp
dir. The builds are needed (three different flag sets), so the profile moved to
the build itself (`python3 -m cProfile -o` on one build, 3.9 s under the profiler):

| function | cumulative |
|---|---:|
| `third_party_imports` (1,080 calls) | 1.29 s |
| of which `own_modules` (an `rglob("*.py")` + `rglob("*")` of all of research/) | 0.66 s |
| `test_count` (1,080 `rglob("test*.py")`) | 0.26 s |
| pathlib `_select_from` / `_iterate_directories` in all | about 0.8 s self |

`research/` holds 456 MB, 18,605 files and 8,160 `.py` files. The build walked it once
for `own_modules`, then twice more per project (`rglob("*.py")` and `rglob("test*.py")`),
which comes to 2,161 directory walks.

## Change

`research_tree()` walks `research/` once with `os.scandir` and keeps three things:
every entry name matching `*.py`, every directory name, and every file under each
project as relative parts. `own_modules`, `third_party_imports` and `test_count`
read from it through `slug_files(slug, pattern)`. The match rules are the same as
`Path.rglob` (Python 3.11): `fnmatchcase` on the name, hidden entries included,
and symlinked directories not entered (`is_dir(follow_symlinks=False)`).

## Verification

- **Byte-identical output.** I built with `--base-url` before and after:
  `diff -r` reports no differences (1,080 projects, 31 topics, 10,879 tests). The
  build was first confirmed deterministic, with two "before" builds also identical.
- **Same answers.** The old and new modules were imported side by side, and
  `test_count`, `third_party_imports` and `own_modules` were compared on all 1,083
  directories: equal, in both import orders.
- **Pinned.** The new `ResearchTreeTest.test_matches_rglob_on_a_made_up_tree`
  compares `slug_files` and `own_modules` with the `rglob` expressions they
  replaced on a temp tree that includes `tests/`, `__pycache__/`, a hidden directory, a deep
  path, an upper-case `.PY`, a top-level file, an empty project and a missing one.
  The old `build.py` fails it (it has no `research_tree`), and the new one passes.
  `python3 -m unittest test_research_homepage_publish`: 20 tests OK.

## Numbers

| measurement | before | after |
|---|---:|---:|
| `test_count` + `third_party_imports` over all 1,083 dirs, in-process (two orders) | 1.05 s, 0.83 s | 0.48 s, 0.44 s |
| whole build, 8 alternating runs each, wall mean | 2.60 s | 2.08 s |
| `test_research_homepage_publish`, 3 alternating runs, wall mean | 12.2 s | 11.2 s |

That is about 0.5 s per build, or about 20%. The test module builds three times,
and the Pages build runs it once more. This container's wall times are noisy
(±0.5 s run to run), so the in-process row is the clean one.

## Not changed, ranked for the next run

1. **`project_page` (2.1 s cumulative):** 0.6 s in `io.open` for 12,687 file opens and
   0.29 s in 1,120 `mkdir`s. These are writes the output needs. Batching is possible but
   would gain little.
2. **`log_html` / `md_spans` (0.5 s):** 111k `re.sub` calls in the inline Markdown pass.
   A combined pattern might halve it, but it needs a pinning test over every LOG.md.
3. **The test module's three builds.** `ResearchPublishTest` and `ResearchSiteChromeTest`
   differ only in `--site-chrome`. Building both forms in one process would save one
   interpreter start and one tree read (about 1 s), but it needs a new build flag.
4. **`test_run_workflow_locally`, `test_run_venture_tests` and `test_adopt_stranded`
   (about 10 s each).** Not profiled this run.
