# agent-permission-harness CI and real-estate-agent-photo-app CI: sparse checkouts (2026-11-27)

Perf track, version 0. Two workflows without the `priv-` prefix still did a
full checkout of the ~81k-file tree to read a small part of it. Both now use
a blob-less sparse checkout, and both give the same answers they gave before.

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 1000 --top 200`, window 01:55 to
02:57 UTC: 1,037 jobs, 1,686.9 job-minutes, **checkout 498.5 (30%)**. The
largest consumers are all `priv-*` (CodeQL, Security gate, Portfolio Pages,
CI policy, Conflict markers) or already ruled out (Portfolio validate:
`ci-perf-2026-11-25-validate-sparse.md`; ventures tests: P063). The next two:

| workflow | jobs | job-min | median job | median checkout |
|---|---:|---:|---:|---:|
| agent-permission-harness CI | 22 | 24.4 | 72 s | 44 s (63%) |
| real-estate-agent-photo-app CI | 8 | 8.0 | 65 s | 38 s (64%) |

The perf backlog had no workable `perf:` item (P063, P064 and P086 are
owner rows). ai-bookkeeper's suite, a for-profit product, was timed first
(`suite_file_times.py ai-bookkeeper --jobs 4`): 351 files, 115 s summed and
30.5 s wall, with the slowest file at 3.4 s. The time is spread flat across
start-up costs, so there is nothing worth a pass there.

## agent-permission-harness: why it needed a code change

The probe's R7 rule counts every file reachable from the agent prompt's
transitive "read this" closure. Any tracked path a document names counts,
for example `package.json` files. So a plain sparse checkout changes the
measurement. Without the patch, the sparse tree gives **12,088 files where
the full tree gives 56,021**. The probe reads the *contents* of Markdown
files (only `.md` is walked through, `CLOSURE_WALKABLE_SUFFIXES`), its
workflows and its own files, and nothing else.

Change (`harness.py`): `_sparse_tracked(root)` returns `git ls-files` when
`root` is the top of a checkout with `core.sparseCheckout=true`, and returns
nothing otherwise. `_file_index` adds those tracked paths to its disk walk.
The explicit-path check in `_expand_prompt_path` and R1's script-exists
check also accept a tracked file that is off disk. A full checkout follows
exactly the old path, untracked files included.

Workflow: `filter: blob:none`, non-cone patterns `*.md`, `/.github/`, the
probe directory and `/portfolio/router/requirements.txt` (the PyYAML step
installs from it): **14,321 files**.

## Verification

- `harness.py --json` and `harness.py` (Markdown) on the full tree and on a
  sparse worktree with the same patterns: `cmp` identical, both files.
- `python3 -m unittest discover -p 'test_*.py'`: 94 tests OK in both trees.
  `check_results_current.py` exits 0 in both.
- New `TestSparseCheckout`: it builds a git repository, makes it sparse, and
  asserts the closure is unchanged. It fails with the patch reverted.

## real-estate-agent-photo-app

Every relative import and file read stays inside the venture (checked with
grep for `../..`, `platform/` and `portfolio/`).
`python3 platform/ci/sparse_checkout_verify.py real-estate-agent-photo-app-ci.yml
.github ventures/real-estate-agent-photo-app`: all 10 run steps match (npm
ci, tests, tsc, lint and build for pipeline, docs-site and research, plus
`node --test` for site: 59 tests, 59 pass, in both), so it exits 0. The four
jobs each get `filter: blob:none` and a cone sparse list of `.github` and the
venture (108 tracked files).

## After

This PR's CI (head `36b821d6a`), with step timestamps from
`actions/runs/<id>/jobs`:

| workflow | checkout before (median) | checkout after | job before (median) | job after |
|---|---:|---:|---:|---:|
| agent-permission-harness CI (run 45931968964) | 44 s | **8 s** | 72 s | **34 s** |
| real-estate-agent-photo-app CI, 4 jobs (run 45931969023) | 38 s | **1-2 s** | 65 s | 6-89 s (build steps unchanged) |

Both runs are green. The harness log in CI reports `instruction set is
56021 repository files`, the same count as a full local checkout, and that
matters because `check_results_current.py` masks this census. At the
window's rates, that is about 13 job-minutes an hour (harness, 22 × 36 s)
plus 5 (real-estate, 8 × 36 s): roughly 1% of the pool. The harness's 8 s
fits the 0.7 ms-per-file cost model in `ci-perf-2026-11-25-validate-sparse.md`
(14.3k files ≈ 10 s).

## Not changed, ranked for the next run

1. **Distribution versions** (3 jobs an hour, 49 s checkout of 63 s): it
   needs `ventures/*-check/` (about 4k files), the allow-listed tools,
   `platform/distribution`, `portfolio/distribution` and `docs/posts` (7.4k
   files, for the content tests). That is a non-cone list under 15k files.
   Verify with `sparse_checkout_verify.py` once its readers are listed.
2. **retail-pilot-intel CI** (2 jobs, 36 s checkout of 69 s): one of the 16
   workflows left unchecked on 2026-11-25. Same recipe as real-estate.
3. **Security gate** (183 jobs, 51 s checkout of 84 s), **CI policy** and
   **Conflict markers**: all `priv-*`, so the owner's call. They are still
   the largest checkout share in the pool.
4. ai-bookkeeper's suite: flat (above). A per-file start-up cost of about
   0.2 s across 351 files is the only lever left, which would mean merging
   files, not a perf fix.
