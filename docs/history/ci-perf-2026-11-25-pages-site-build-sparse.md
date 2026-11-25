# Portfolio Pages site build (pages.yml): sparse, blob-less checkout (2026-11-25)

Perf track run. Both open `perf:` backlog items are owner-gated (P063 needs
the unwired checks moved first; P064 edits `priv-portfolio-pages.yml`), so
this pass took the pool reading.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-25 11:59 to
12:56 UTC: 707 jobs, 1041.6 job-minutes, checkout 370.9 (36%).

| workflow | file | jobs | job-min | median job | checkout |
|---|---|---|---|---|---|
| Portfolio Pages site build | `pages.yml` | 12 | 14.3 | 80 s | 58% (median 42 s) |

The page-sweeps pass earlier today
(`ci-perf-2026-11-25-page-sweeps-sparse.md`) listed "the Pages site build"
among the `priv-*` workflows. It is not: the Python mirror builder is
`pages.yml`, outside the owner-only core, so it can land after the risk
review. The other checkout-heavy rows (Security gate, CI policy, Conflict
markers) are `priv-*`; agent-permission-harness CI walks the repository's
prose on purpose, so a sparse tree would change its answer.

## What blocked a plain sparse checkout

A sparse worktree without `research/`, `docs/` and `prompts/` built a
different site: two pages of `wall-condensation-check` link to
`../../research/house-dewpoint/`. `repoint_offsite_links()` rewrites such a
link to the GitHub tree URL only if the path exists on disk, so in the sparse
tree the link stayed relative and `check_pages_links.py` failed (2 broken
references).

## Change

- `platform/ci/build_pages_site.py`: when a link's target is missing on disk,
  ask git's index (`git ls-files -z`, read once and only on a miss). The index
  lists every tracked path whether or not it is checked out. On a full tree
  every tracked file is on disk, so the disk answers first and nothing
  changes; untracked or missing paths still fall through untouched.
  New unit test: a tracked path absent from disk is repointed (file and
  directory), a missing one is not.
- `.github/workflows/pages.yml`: `filter: blob:none` and a non-cone sparse
  pattern: root files, everything but `research/ docs/ prompts/`, and no
  media the builder never ships (`mp3 mp4 gz zip step stl ttf`; `WEB_SUFFIXES`
  ships png/jpg/webp/gif/ico/woff/woff2, so those stay).

| | full tree | sparse |
|---|---|---|
| tracked files checked out | 80,502 | 38,559 |
| bytes on disk (no `.git`) | 2.3 GB | 507 MB |

## Verification

Each step of the job (generated pages, `--check`, build with a fixed base
URL, `check_pages_links.py`, `check_built_site.py`, the two unit modules)
was run in the full tree and in a sparse worktree of HEAD with the exact
workflow pattern:

- built `_site` (1440 products, 20,426 files): `diff -r` identical;
- `--check` output identical; link check "OK: every local reference
  resolves" in both; 0 placeholders in both; unit tests 52/52 in both;
- full-tree build before the change (`git stash`) vs after: `diff -r`
  identical.

The runner after number is the next pool reading's checkout median for this
workflow (before: 42 s median, 58% of an 80 s job). A local clone time is no
stand-in for a runner's, so none was taken.

## Not changed, ranked for the next run

1. `priv-security-gate.yml` (180.7 job-min, 61% checkout), `priv-ci-policy.yml`
   (88%), `priv-conflict-markers-ci.yml` (81%): owner-only files.
2. `priv-portfolio-pages.yml` "Test the site builder" (63.6 min) and the
   gallery-search stamp (P064): owner-only.
3. CodeQL analyze (270.7 min): the largest step, but the analysis itself.
4. ventures tests (P063): needs the unwired checks split into a full-tree job
   before the venture job can go sparse.
