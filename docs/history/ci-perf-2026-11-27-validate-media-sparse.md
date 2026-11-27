# Portfolio validate: leaving out audio and video does not speed up checkout (2026-11-27)

Perf track, version 0, item 2 (a fresh reading of the runner pool). There was
no agent-workable `perf:` backlog item (P063, P064 and P086 are owner rows).
The jobshop-quote and seller-books worker suites were already taken (open PR
#19702), and the pay-app-guides pages (the front door to bet #1) are already
light: `module-exclusive.mjs` gives 10 kB gz for `index.html` and 1 to 6 kB
for the guides. This is a **negative result**. The change was tried on a real
runner and reverted. It is written up so the next run does not try it again.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-27,
10:27 to 11:11 UTC): 692 job-minutes, checkout 202.7 of them. The largest
consumer that is not a `priv-*` workflow or owner-owned is `portfolio-validate.yml`:
22 jobs, 84.3 minutes, median job 228 s, 24% checkout. Per-step times from
`--runs 300 --save`, Portfolio validate jobs only (11 with steps):

| | values (s) |
|---|---|
| checkout | 37, 40, 46, 46, 47, 47, 49, 49, 54, 82, 156 (median 47) |
| whole job | 41, 168, 181, 191, 219, 247, 249, 251, 259, 294, 528 |

After checkout, the other ~110 steps take 0 to 7 s each, and none of them is a
single lever.

The job checks out the whole tree: 2.2 GB, 83,829 files (`git ls-tree -r -l`).
The 100 `.mp3` and 16 `.mp4` files make up 0.64 GB of it (saints-by-candlelight
321 MB, hearth-and-horizon 223 MB, docs/podcast 65 MB, sed-contra 21 MB).

## What was tried

The checkout got `filter: blob:none`, `sparse-checkout-cone-mode: false` and
the patterns `/*`, `!*.mp3`, `!*.mp4`: everything except audio and video.

The steps give the same results without the media:

- `run_workflow_locally.py portfolio-validate.yml`: 107/107 run steps passed
  on the full tree (3m33s) and with the media taken out by sparse checkout
  (3m20s). The base-ref regression step did not run in either, because
  locally there is no base ref.
- I ran the 33 tree-walking checks in the job (every `platform/ci/check_*.py`,
  `publish_surface`, `favicons`, `usage_state`, the five `platform/pages` and
  `platform/privacy` scripts) plus `check_venture_regression.py --base
  origin/main` in both states and saved their stdout. The two outputs were
  byte-identical, and every check exited 0. `check_payment_keys.py` is the
  only one that names `.mp3` or `.mp4`, and only in its list of skipped
  binary extensions.
- In a blob-less clone, the venture-regression check passes against a fetched
  base. Missing blobs are fetched lazily without credentials (a podcast mp3
  arrived in 0.5 s). Only 113 blobs were missing after checkout.

Download from github.com in this container, the same fetch that
`actions/checkout` runs (`--depth=1`, one SHA):

| | `.git` size | fetch + checkout |
|---|---:|---:|
| full (now) | 1.2 GB | 73.8 s |
| blob:none, media left out | 628 MB | 73.6 s |

The download is half the size and takes the same time. On the PR's own run,
on a GitHub runner (run 45990702206, PR #19723), **checkout took 54 s**.
That falls inside the earlier spread (9th of 11, median 47 s), and the job
took 222 s against a median of 228 s. There was no gain, so the workflow
change was reverted before merge.

## Why bytes are not the cost

Checking out the 83.8k files from a local pack, with no network, takes
**23.8 s** on 4 cores (10.2 s user, 12.6 s sys): that is the cost of writing
the files. The rest is the server building a depth-1 pack for the commit,
and a `blob:none` fetch does that twice (trees first, then the blobs
checkout asks for). Media files are few and large, and they do not compress,
so they are a small share of that work. The earlier sparse passes that did
pay off (`ci-perf-2026-11-03-prompts-sparse.md`, `doc-refs-ci.yml`,
`ci-perf-2026-10-30-guard-checkouts.md`) cut the **number of files**, to a
few directories.

## Not changed (ranked, for the next run)

1. **A cone-mode checkout of the directories this job reads.** That is
   `ventures/`, `docs/posts/`, `platform/`, `portfolio/`, `prompts/` (run
   records), `.github/`, and the top-level docs. Leaving out `research/`
   (about 23k files) and `docs/reports`/`docs/podcast` would cut the file
   count. First check which steps glob `research/` or read `docs/reports`
   (`usage_state.py --require-honest` reads steering documents). Then
   measure on a runner the same way as here, with more than one sample:
   checkout times range from 37 to 156 s.
2. **Splitting the job into two parallel jobs.** This would cut wall time but
   add a second checkout, about 47 s of pool time. That is a poor trade
   while the pool is the limit (`ci_starvation.py`).
3. **One `unittest` process for the ~40 checker suites.** Each step costs
   0.1 to 7 s, and the per-step overhead is small, so the saving would be
   seconds, at the price of the per-step failure names.

## Metric

Before: checkout median 47 s (11 jobs). After (1 runner sample): 54 s.
Locally the download was 1.2 GB before and 628 MB after, with the same
73.7 s wall time. No change landed.
