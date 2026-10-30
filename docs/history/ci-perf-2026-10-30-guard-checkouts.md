# Guard checkouts fetch only what each guard reads (2026-10-30)

Backlog item P048, part 1. The owner asked on 2026-10-24 for CI to clone only
what each job needs (`ci-perf-2026-10-24.md`, `pages-test-perf-2026-10-24.md`).

## The reading

    python3 platform/ci/ci_profile.py --runs 600 --top 30

600 runs, 01:48 to 02:17 UTC on 2026-10-30 (29 minutes): **319 jobs, 356.5
job-minutes**, checkout 95.2 (27%). The pool was saturated: median queue time
was **589 to 787 seconds** for every busy workflow. A job-minute saved now
shortens a ten-minute wait for every PR behind it.

| Guard | jobs | job-min | median job | checkout share |
|---|---|---|---|---|
| Conflict markers | 45 | 24.6 | 33s | 59% |
| Checklist coverage | 35 | 14.9 | 24s | 77% |
| Doc references | 28 | 12.1 | 24s | 77% |
| README live links | 19 | 8.3 | 24s | 77% |
| Sibling links | 13 | 6.2 | 27s | 74% |
| Link contrast | 13 | 5.5 | 25s | 77% |

## Why the checkout is slow

The tree is 893 MB in 43,798 files. **442 MB of it is 80 MP3 files** (35 podcast
episodes in `docs/podcast/audio`, 45 in two audio-story ventures), and STEP, STL, PNG, ZIP and PDF files add about 80 MB more. Every
guard downloaded all of it at depth 1, then read a few hundred files.

Clones of `main` from GitHub on the cloud container (one sample each; the
runner is about twice as fast, the ratios carry over):

| Checkout | time | `.git` |
|---|---|---|
| depth 1, everything (the old default) | 38.3s, 46.3s | 542 MB |
| conflict markers' pattern | 29.5s | 128 MB |
| checklist coverage's pattern | 9.3s | 25 MB |
| duplicate symbols' pattern | 6.5s | 18 MB |
| link contrast's pattern | 4.6s | 22 MB |
| names only (`--filter=blob:none`, no working tree) | 0.9s | |

## The change

Each of the four guards' `actions/checkout` step gains `filter: blob:none`
and a non-cone `sparse-checkout` listing what its script reads, so only those
blobs are fetched:

| Workflow | Pattern | Why it is complete |
|---|---|---|
| `conflict-markers-ci.yml` | everything except `*.mp3 *.png *.zip *.webp *.woff2 *.ttf *.ico *.gif` | git never writes markers into a file with a NUL in its first 8 KB, which these formats always have. `.step` stays in: all 105 are text. |
| `checklist-coverage.yml` | root `*.md`, `pyproject.toml`, `.github/`, `platform/ci/`, `*.test.mjs`, `*.py` | the script globs exactly `*.test.mjs` and `*.py` for names, and reads only the checklist, `CLAUDE.md` and `pyproject.toml` |
| `duplicate-symbols-ci.yml` | `*.py` | the script reads `git ls-files '*.py'`, and its unit tests are `.py` too; an unreadable file is already reported as a failure |
| `link-contrast-ci.yml` | `ventures/*/*.html`, `ink.mjs`, `ink.test.mjs` | `ink.mjs` reads the `.html` files directly inside each venture directory; its test imports only `ink.mjs` |

The risk in a narrower checkout is a guard that passes because it read less.
`check_conflict_markers.py` lists files with `git ls-files`, which in a sparse
checkout still names every tracked file, and skipped unreadable ones
silently. It now fails if any tracked file outside `BINARY_SUFFIXES` is
missing from the working tree, with two new unit tests.

## Verification

Each guard ran in a local worktree checked out with exactly its pattern
(`git worktree add --no-checkout` plus `git sparse-checkout set --no-cone`):

| Guard | sparse run | against the full tree | seeded violation |
|---|---|---|---|
| conflict markers | exit 0, 43,195 files | both clean | a marker in a README: exit 1 |
| conflict markers, pattern narrowed to drop `*.yaml` | | | exit 1, names the missing files |
| checklist coverage | exit 0, 12,934 files | output identical | an unlisted `platform/newthing/a.test.mjs`: exit 1 |
| duplicate symbols | exit 0, 7,103 files; unit tests OK | output identical | a function defined twice: exit 1 |
| link contrast | exit 0, 3,158 files; unit tests OK | output identical | |

`validate_workflows.py`: all workflow files valid.
`test_check_conflict_markers`: OK, including the two new tests.

## Expected effect

From the window above, per guard: checkout seconds per job times the clone
ratio. Conflict markers saves about 6s per job, checklist coverage about 14s,
link contrast about 17s. Duplicate symbols ran no jobs in this window; it
ran 21 in the 2026-10-24 one. Roughly 16 of 356 job-minutes per 29 minutes,
about 5% of the pool. Re-run `ci_profile.py` after a day of merges and
compare each guard's checkout median.

## Not changed yet, ranked (P048 part 2)

1. **Doc references** (28 jobs). `check_md_links.py` checks that a link's
   target exists on disk, and targets include PNGs and MP3s. A `*.md`-only
   checkout fetches in 4.7s but would report every link to an absent file as
   dead. Fix: check existence against `git ls-files` (which lists absent
   sparse files too), then narrow the checkout.
2. **README live links** (19 jobs). Reads venture and research READMEs,
   `index.html` presence and `projects.json`; same existence question.
3. **Sibling links** (13 jobs). `siblings.mjs` imports `build.mjs` and its
   modules; record which files a run opens before narrowing.
4. **Portfolio validate** (42 jobs, 124 job-minutes, median 190s, 11%
   checkout) is the pool's largest consumer now. Its cost is its steps, not
   its clone: "Check inline scripts parse" took 24.6 minutes. That belongs to
   a perf run of its own, not to P048.

## Part 2a: doc references (same day)

`check_md_links.py` and `check_code_refs.py` now accept a target that is in
`git ls-files` (files and their directories) as present, so the
`doc-refs-ci.yml` checkout is `*.md` plus `platform/ci/` with `blob:none`.
Verified in a sparse worktree (53 MB, no media): both guards exit 0 with the
new scripts and the 5,108-file link check passes; the old scripts reported
2,596 dead links on the same tree. New unit test `SparseCheckout`. README live
links and sibling links remain (items 2 and 3 above).

## Part 2b: README live links; sibling links left whole (2026-10-30)

`readme-live-links-ci.yml` now fetches `platform/ci/`, `ventures/*/README.md`,
`ventures/*/index.html`, `research/README.md`, `research/*/README.md`,
`research/*/project.json`, `research/_homepage/` and `pyproject.toml`
(blob:none). In a worktree with exactly that pattern (4,343 files of 45,492
tracked) all three scripts exit 0 as on the full tree, and the 19 guard unit
tests pass.

Sibling links stays on a full checkout. `siblings.mjs` imports `build.mjs`,
which imports `platform/counter` and reads venture sub-pages and research
READMEs. A sparse tree of `platform/`, venture HTML/JSON/MJS and READMEs
(16,405 files, 202 MB) still gave a false orphan on `--check`, so the saving
is small and the risk of a guard passing or failing on less than it reads is
real. Not worth pursuing without first making `siblings.mjs` list its inputs.
