# Portfolio validate: a sparse checkout that did not pay (2026-11-25)

Perf track, version 0. A negative result with a cost model. Read it before
adding `filter: blob:none` to a workflow that keeps most of the tree.

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, window 18:04 to
19:07 UTC: `Portfolio validate` ran 32 jobs, 84.6 job-minutes, **median job
198 s**. A second 600-run window put its checkout at a **44 s median**
(n = 34). It is the largest unowned workflow (not `priv-*`) in the pool.
CodeQL, the Security gate, Portfolio Pages and CI policy are larger, but all
are `priv-*`.

A full checkout in this job's log (job 139441872860) took 32 s to fetch and
11 s to write 80,684 files, **43 s** in all.

## What the job reads

I ran all 106 `run:` steps of `portfolio-validate.yml` under
`strace -f -e trace=%file,getdents64`, one trace per step. All 106 exited 0.
The only touches of `research/` (22k files, 758 MB) were:

- `doc_index.project_slugs` (step "Check blog post front matter"), which lists
  `research/<slug>` from `git ls-tree`, so the tree and not the disk;
- the live scan in `test_checklist_coverage`. Its `research/` half is also the
  full-tree gate `checklist-coverage.yml`, which runs on every PR that could
  open a gap there (any test file, `verify-and-merge.md`, `pyproject.toml`);
- pytest's rootdir probe looking for a `pyvenv.cfg`, which gets ENOENT.

Of the 116 `.mp3`/`.mp4` files (549 MB in `ventures/` alone), steps stat 60 to
1,400 entries, but no step opens one.

So a sparse tree of `/*`, `!/research/`, `!*.mp3` and `!*.mp4` holds 58,651
files. I ran all 106 steps in that tree and in the full one and compared them.
The exit codes, the test-count lines (`Ran N`, `# tests`, `# pass`, `# skipped`,
pytest's `N passed`) and each step's last line matched, apart from durations
and the `origin/main` sha, which moved between the two runs. The first sparse
run differed in one place: one test was skipped in
`test_run_workflow_locally`. That was my shallow clone having no merge base,
not a missing file. It ran and passed once I deepened the history.

The change was safe. It was also not faster.

## Measurements

| checkout | files written | fetch | write (incl. lazy fetch) | total |
|---|---:|---:|---:|---:|
| CI, full (job 139441872860) | 80,684 | 32 s | 11 s | **43 s** |
| CI, `blob:none`, `/*` `!/research/` (PR 19072, first push) | 58,775 | 0.8 s | 42 s | **49 s** step |
| CI, `blob:none`, also `!*.mp3` `!*.mp4` (PR 19072, second push) | 58,661 | 0.6 s | 43 s | **44 s** step |
| local, full | 80,681 | 40 s | 14 s | 54 s |
| local, `blob:none`, `!/research/` | 58,767 | 1 s | 93 s | 94 s |
| local, `blob:limit=512k`, `!/research/` | 58,767 | 22 s | 36 s | 57 s |
| local, `blob:none`, also no media | 58,651 | 1 s | 53 s | 53 s |

The local rows come from `git init` plus `fetch --depth=1` of `4bf77a0d4`
against github.com through this container's proxy, then `checkout`. The pack
went from 1.2 GB (full) to 902 MB (no `research/`) to 342 MB (no media either).

## The cost model

With `filter: blob:none`, `git checkout` fetches the missing blobs in one
batch. On GitHub's runners that batch costs about **0.7 ms per file,
whatever the bytes**: 902 MB and 342 MB both took about 42 s for 58.7k
files. A full depth-1 fetch streams the whole pack, about 43 s for 80.7k
files. The workflows already using `blob:none` with wide patterns fit the
same line (checkout medians from the 600-run reading):

| workflow | files kept | checkout median |
|---|---:|---:|
| `sibling-links-ci.yml` | 38,411 | 25 s |
| `page-integrity-ci.yml` | 38,411 | 30 s |
| `portfolio-validate.yml` (this PR, reverted) | 58,661 | 44 s |
| `priv-conflict-markers-ci.yml` | 79,616 | **48 s** (n = 42) |
| full checkout (Portfolio validate, Portfolio Pages, CodeQL) | 80,681 | 43-44 s |

**A blob-less sparse checkout pays when it keeps well under about 50k
files.** Below about 5k files (the venture workflows,
`ci-perf-2026-11-25-venture-workflow-sparse.md`) it is a large win. Near the
full tree it is a loss: `priv-conflict-markers-ci.yml` keeps 99% of the files
and pays about 5 s more per job than a plain checkout, across about 42 jobs an
hour. That workflow is owner-gated, so it is filed as backlog P086.

## Change

None. The workflow edit is reverted in the same PR, and the job keeps its
full checkout. The PR ships this note, P086, a line in
`platform/ci/sparse_checkout_verify.py`'s docstring and a section in the
"Rewrite it in Rust" post.

## Not changed, ranked for the next run

1. **P086, owner-gated:** `priv-conflict-markers-ci.yml` should drop `filter:
   blob:none` (a plain checkout, about 43 s), or keep the filter and exclude
   much more. The script needs every text file, so that is hard.
2. **`Portfolio validate` without a filter** (sparse only): the fetch stays
   about 32 s, and writing 58.7k files instead of 80.7k saves 3 or 4 s. That
   is not worth the coupling. A real win would need the job to stop needing
   most of `ventures/`, or the steps split by what they read.
3. **The other 150 s of the job** is 106 serial steps, most taking 2 to 4 s.
   The largest are "Local workflow-runner unit tests" (10 s median) and
   "Router ranking-logic unit tests" (6 s). Per-step runner overhead is
   most of the rest. Merging steps would trade away the per-check failure
   labels the comments ask for.
4. CI policy (61 s checkout median, 88% of its job) and the Security gate
   (47 s) are the worst checkouts in the pool, and both are `priv-*`.
