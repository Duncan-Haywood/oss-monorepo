# error-rate-disclosure CI: sparse checkout, plus a fresh site-builder reading (2026-11-27)

Perf track, version 0. The perf backlog had no agent-workable item (P063,
P064 and P086 are owner rows).

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 1500 --top 200`, window 04:13 to
05:09 UTC: 874 jobs, 1,466.2 job-minutes, checkout 418.8 (29%). The largest
consumers are `priv-*` workflows (CodeQL, Security gate, Portfolio Pages, CI
policy, Conflict markers) or owner rows (ventures tests, P063). Every other
workflow with a high checkout share already has a sparse checkout (Sibling
links, Doc references, Checklist coverage, Link contrast, README live links,
Page integrity, Prompts, Duplicate symbols). Two without one remain in the
"spends half or more before its first real step" list:

| workflow | jobs in window | median job | median checkout |
|---|---:|---:|---:|
| error-rate-disclosure CI | 3 | 64 s | 46 s (71%) |
| Distribution versions | 1 | 65 s | 49 s (75%) |

This pass takes error-rate-disclosure. Its trigger includes
`portfolio/pipeline/probes/**`, which agent-permission-harness PRs touch often.

## Change

`.github/workflows/error-rate-disclosure-ci.yml`: `filter: blob:none` and a
non-cone sparse list:

```
*.md
/.github/
/portfolio/pipeline/
/portfolio/research/error-rate-disclosure/
/portfolio/research/register-change-rate/
```

That is 14,397 files instead of 82,403. Why each path is there: `measure.py` imports the
four probes from `portfolio/pipeline/probes/`, reads
`register-change-rate/results-2026-08-20.json` and `candidates.yaml`, and
checks citations in four READMEs. `render_harness` runs
`agent-permission-harness`'s `harness.analyse(REPO)` over the whole repository.
That walks every `*.md` and `.github`. Since this morning it lists the rest
with `git ls-files` when the checkout is sparse (`_sparse_tracked`,
`ci-perf-2026-11-27-agent-permission-harness-sparse.md`), so its census does
not shrink.

## Verification

Three trees at `412fe4507`: this clone, a clean full worktree (82,403 files)
and a sparse worktree with the list above (14,397 files):

- `python3 -m unittest discover -p 'test_*.py'`: `Ran 25 tests`, `OK` in all three.
- `python3 measure.py 9999-perf`: the results JSON is `cmp`-identical in the
  sparse and the clean full tree.
- Every probe's rendered artifact (`spec['render']()` for each of
  `PROBE_SPECS`): `cmp`-identical between sparse and clean full. The
  harness's census reads `instruction set is 56174 repository files` in both.
  This clone read 56,193 because the walk also counts 19 ignored files on
  local disk. A CI checkout has none of those, so the clean worktree is the
  right baseline.

`sparse_checkout_verify.py` was not used because it builds cone-mode trees
only, and this list needs `*.md`. The sparse worktree was built by hand with
`git sparse-checkout set --no-cone` and the same patterns.

## After

The after number comes from this PR's CI run of the workflow. At the
agent-permission-harness workflow's rate (44 s to 8 s checkout for a 14.3k-file
sparse set of the same shape), expect roughly 46 s to 8 s per job.

## Site-builder suite, re-read (nothing changed)

`Test the site builder` is still the largest single step outside CodeQL
(50.7 job-min in the window, inside `priv-portfolio-pages.yml`). Read again
in a fresh 4-core container:

| run | wall | CPU |
|---|---:|---:|
| whole suite, cold card cache (`node --test "*.test.mjs" "cloudflare/*.test.mjs"`) | 334 s | 1,025 s; 2,182 pass |
| one `buildSite` at the suite's base URL, cold cards | 143 s | 416 s (the main thread idle 80 s, waiting on card workers) |
| the same build, warm `PAGES_CARD_CACHE` | 52 s | 63 s |

The suite's first test waiting on the shared build read 273 s cold. CI
restores the card cache, so the warm build is the one CI pays. Its profile is
flat, as every earlier pass found: `writeFileUtf8` 6.5 s, GC 3.7 s, file
opens, reads and closes about 7 s, then regexes under 1.2 s each. The build
writes 39,236 files and 1.8 GB. `writing/` is 611 MB of that (7,828 share
cards at 379 MB, 7,828 post pages at 118 MB, 40 MP3s at 65 MB).

Not changed, ranked:

1. **Hard-linking cached cards instead of copying them** (`renderCards`'
   `copyCached`). Measured on the 10,529 cached cards: `fs.copyFile`
   1.8 to 1.9 s and `fs.link` 0.6 s, both at the same `mapLimit(32)`. That
   saves about 1.2 s of a 52 s build. The cost is that output and cache share
   inodes, so any later in-place write to a card would corrupt the cache. Not
   worth it.
2. **A default card cache when `PAGES_CARD_CACHE` is unset.** It would help
   only a second suite run in the same container. Cloud sessions are fresh
   containers, and `run_workflow_locally.py` already keeps a stand-in cache.
3. **Distribution versions' checkout** (1 job in the window). Its
   `pypi-packages.mjs` discovers packages by walking `ventures/`, so a sparse
   list could quietly drop a tool from discovery. It needs a test that pins
   the discovered set before any narrowing.
4. `.github/prompts/verify-and-merge.md` line 15 said the pages suite takes
   "~22 min in a cloud session (measured 2026-10-18)". It is 5.5 min cold now,
   so this PR updates that comment.
