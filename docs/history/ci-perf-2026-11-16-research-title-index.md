# CI perf, 2026-11-16: the research homepage's quadratic title check, and a check that parsed 9,081 files

Perf track. Both open perf backlog items (P063, P064) touch `.github/workflows/`
(CODEOWNERS, owner-only), so this run took a fresh pool reading (step 2 of the
perf prompt).

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-16 22:34Z to
23:37Z): 567 jobs, 613.7 job-minutes. `ventures tests` 37 jobs, 120.3 min;
its heaviest step, "node --test in each touched venture", 88 to 92 min.

That step's log on main (job 133671281894, BASE 1e0839300) showed the two
venture suites done at 22:53:31 and the step finished at 22:55:42: **131 s
went to `unwired_checks.run_everything()`** (205 platform/ci checks, Python
suites and platform node suites no workflow names), which every PR that reaches
ventures tests runs. On 2026-11-14 the same phase was 42 s locally
(`ci-perf-2026-11-14-icon-memo-unwired-pool.md`); it has since grown by about
45 items.

A scratch script wrapping each runner in `run_mixed` with a timer (same 4-core
container, 6 workers as in CI):

| | wall | sum of item times |
|---|---:|---:|
| `run_everything()`, before | 55.4 s | 324.5 s |

Top items: `test_research_homepage_publish.py` 23.7 s, `check_finite_thresholds.py`
14.7 s, `test_check_finite_thresholds.py` 14.7 s (it runs the check on the
whole tree), `test_no_dead_pages_base.py` 11.2 s, `test_research_archive.py` 10.4 s.

## Profiles

**`research/_homepage/build.py`** (`python3 -m cProfile -s cumulative`, 7.7 s
under the profiler): `clipped_title_taken` 3.3 s and `shared_title` 0.4 s. For
each of 1,080 project pages, both scanned every other project, and the clipped
check re-ran `plain()` (a regex and an unescape) and `title_tag()` on every
other project's title: 1.16 M `plain` calls in one build. The test module
builds the site four times (base URL, site chrome, and two identical bare
builds). The same builder runs in every Pages build (`RESEARCH_BUILDER` in
`platform/pages/build.mjs`) and in `research-ci.yml`.

**`check_finite_thresholds.py`** (30.2 s under the profiler): `ast.parse` of
9,081 tracked Python files 5.8 s and `ast.walk` over every node 20.4 s. A hit
needs a call to the attribute `add_argument` with `type=float`; only 381 files
contain `add_argument` and 155 contain both `add_argument` and `float`.

## Change

1. `research/_homepage/build.py`: `title_index(themes)` maps each title and
   each clipped `<title>` text to the set of slugs that have it, built once in
   `build()` and passed to `project_page` (new keyword `titles`).
   `shared_title` / `clipped_title_taken` take it as an optional `index` and
   answer "another slug has this" with one set lookup; with no index they
   build one, so any other caller gets the old answer.
2. `platform/ci/check_finite_thresholds.py`: `offending_flags` returns early
   unless the source text contains both `add_argument` and `float`. Identifiers
   appear spelled out in the source, so no file the check could flag is skipped.
   The flag literal is not prefiltered, since `"--" "max-age"` is one constant
   to `ast` but not one substring.
3. `platform/ci/test_research_homepage_publish.py`: the two classes that read
   a bare build (`ResearchSiteChromeTest.bare`, `ResearchIndexLengthTest`)
   share one, built once per module (`bare_build()`); four builds become three.

## Verification

- **Same bytes.** The old and new `build.py` each built the three forms the
  tests use (bare, `--base-url`, `--base-url --site-chrome`): `diff -r` over
  6,417 files reports nothing. 20 project pages carry the `(research/<slug>)`
  suffix, so the changed path is exercised.
- **Same answers, pinned.** New `TitleIndexTest`: on the real registry and on
  a made-up set of exact and clipped clashes (a project listed in two topics
  included), the indexed answers equal a pairwise scan of every other project,
  and on the made-up set the no-index path agrees too.
- **Check, same answers.** Old and new `offending_flags` over every tracked
  file: 0 files differ. New test: a call split over lines, `type = float`
  with spaces and an implicitly concatenated `"--" "max-age"` is still caught,
  and `type=int` with "float" only in a comment is still clean.
- `python3 -m unittest test_research_homepage_publish test_check_finite_thresholds
  test_research_md_spans test_unwired_checks`: all pass.

## Numbers (4-core container, wall clock)

| | before | after |
|---|---:|---:|
| `build.py`, bare / base URL / site chrome | 3.53 / 3.05 / 2.78 s | 1.62 / 1.74 / 1.70 s |
| `test_research_homepage_publish` (3 runs) | 15.9 / 15.8 / 16.9 s | 9.1 / 9.9 / 9.9 s |
| `test_check_finite_thresholds` | 14.7 s (in the pool) | 0.93 s |
| `check_finite_thresholds.py` | 14.7 s (in the pool) | 0.60 s |
| `run_everything()`, wall | 55.4 s | 41.7 / 41.7 s (two runs) |
| `run_everything()`, sum of item times | 324.5 s | 245.0 s |

About 14 s (25%) off the unwired phase locally, and 80 CPU-seconds of the
pool's work. CI's runner took 131 s for the phase on the job read above, so
the saving there should be at least as large in seconds. The Pages build and
research CI each run `build.py` once and save about 1.5 s each.

## Not changed, ranked for the next run

1. **`platform/distribution/desktop.test.mjs`** (9 to 11 s in the pool, now the
   longest item with the research test): the 2026-11-14 profile showed icon
   drawing; read whether the remaining time is per-venture packaging.
2. **`test_research_archive.py`** (6.5 to 10.4 s) and
   **`test_no_dead_pages_base.py`** (11.2 s before): not profiled.
3. **`check_irs_table_figures.py`** (7 to 8 s), `check_dst_day_step.py` (6 s),
   `check_csv_formula_guard.py` and `check_insecure_refs.py` (4 to 6 s): other
   whole-tree scans; the same text prefilter may fit if they parse every file.
4. `research/_homepage/build.py` is now I/O-bound (12,555 opens, `rglob`s of
   research/ for test counts and imports, 0.7 s): one walk shared by
   `test_count`, `third_party_imports` and `own_modules` would save part of it.
5. P063 and P064 are still owner-gated.
