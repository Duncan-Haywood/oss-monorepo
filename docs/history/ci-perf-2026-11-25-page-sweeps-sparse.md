# Page integrity and Sibling links: sparse, blob-less checkouts (2026-11-25)

Perf track run. Both open `perf:` backlog items (P063, P064) already have
stalled PRs; this pass took the pool reading instead.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-25 08:28 to
09:18 UTC: 628 jobs, 928.3 job-minutes, checkout 332.6 (36%).

| workflow | jobs | job-min | median job | checkout share |
|---|---|---|---|---|
| Page integrity | 18 | 25.0 | 88 s | 64% (median 67 s) |
| Sibling links | 17 | 15.9 | 59 s | 82% |

Both are non-`priv-` workflows that sweep the venture pages in a few seconds
and spend the rest of the job cloning a tree they mostly never read. The
other checkout-heavy workflows in the reading (Security gate, CI policy,
Conflict markers, the Pages site build) are `priv-*`, owner-only in
`.github/CODEOWNERS`, and were not touched.

## Change

Both checkouts now fetch blob-less with a non-cone sparse pattern: the root
files, everything except `research/`, `docs/` and `prompts/`, and no binary
media (`mp3 mp4 gz zip png jpg webp gif ico woff2 ttf step stl`). Page
integrity keeps `fetch-depth: 0` (its history-blob tests `git show` old
pages; blob-less fetches them on demand, sparse checkout does not affect
that).

| | full tree | sparse |
|---|---|---|
| tracked files checked out | 80,363 | 38,354 |
| bytes on disk (no `.git`) | 2.3 GB | 505 MB |

Cone mode with `.github ventures platform portfolio` (1.20 GB of the 2.16 GB
of HEAD blobs) was the first candidate; the binary exclusions, the pattern
`priv-conflict-markers-ci.yml` already uses, cut another ~700 MB, mostly the
549 MB of MP3s under `ventures/`.

Sibling links needs `portfolio/`: `siblings.mjs` imports `build.mjs`, which
imports `portfolio/requests/requests.mjs`. With only `.github ventures
platform`, `sparse_checkout_verify.py` reported its tests at 1 run / 1 failed
(import error), so `portfolio/` stays in.

## Verification

- `python3 platform/ci/sparse_checkout_verify.py` (cone mode): Page integrity
  same with `.github ventures platform` (65 tests, 63 pass, 2 skip in both:
  the history-blob skips of this shallow clone, which CI's full history runs);
  Sibling links same with `portfolio` added (20/20).
- The final non-cone pattern, in a sparse worktree of HEAD: `siblings.mjs
  --check` and `check_pages.mjs` stdout byte-identical to the full tree
  (md5 `246339b1...` and `4728e58f...`), siblings tests 20/20, webcheck tests
  65 / 63 pass / 2 skip, as in the full tree.

The after number on the runner is the next pool reading's checkout share for
these two workflows; no local stand-in for a runner's clone time was taken.

## Also in this PR

PR #18854 (pay-app-guides) committed four Python wheels by accident: three
at the repository root (`pyyaml`, `python_stdnum`, `ledger`) and one in
`ventures/ai-bookkeeper/`. Nothing references them; python-stdnum is LGPL,
which the repository's licence list does not cover, and root files land in
every cone-mode sparse checkout. Removed, and `*.whl` added to `.gitignore`.

## Not changed, ranked for the next run

1. `priv-security-gate.yml` (156 job-min, 59% checkout) and
   `priv-ci-policy.yml` (88% checkout): owner-only files.
2. `priv-portfolio-pages.yml` "Test the site builder" (90.8 min): the
   largest single step; the pages-test history files cover earlier passes.
3. Stalled PRs #12946 and #13582 (Sibling links, binary-excluding sparse)
   waited on owner review under the pre-2026-11-24 rule; this PR supersedes
   them.
