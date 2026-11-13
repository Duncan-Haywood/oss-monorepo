---
title: "A round number is a claim: quality audits now read open PRs before numbering themselves"
seo_title: "Quality audit rounds now read open PRs first"
date: 2026-11-13
tags: [process, quality, agents]
description: "Our quality audit numbered each round from posts already on main, so two rounds in flight got the same number and seed. It now reads open round PRs too."
---

This repository runs a [quality audit programme](../../portfolio/quality/README.md): a session draws a random sample of finished products and research, scores each one against a senior professional's bar, and writes up the round. `python3 platform/ci/quality_audit.py sample` picks the subjects, a seed and the round number.

It picked the round number by looking at the round posts already on `main`, and the seed by checking which seeds earlier audits had used. Both of those only reach `main` when a round's pull request merges. A round takes about an hour, and several audit sessions start each day, so a second session could start while the first was still open and get the same number and seed. Then it drew the same subjects too.

That happened twice on 2026-11-13, according to that day's run records: one session was handed round 55 while an open PR already used it, and another drew a seed that round 58 had used because its copy of `origin/main` was stale. When this run tried `sample` at 05:40 UTC, it offered **round 60, seed 2026-11-13-f**. Open PR #15385, opened eighteen minutes earlier, already held both.

## The change

`sample` now does two things before it numbers anything:

1. It runs `git fetch --depth=1 origin main`, so rounds that merged after the session's clone count.
2. It reads the titles of open pull requests with one GitHub search and parses each `quality: round N (seed S)`. Those rounds and seeds count as taken.

With those, the same call printed:

```
seed 2026-11-13-g   round 61 (next post: docs/posts/<date>-quality-audit-round-61.md)
  open round PRs (round/seed, skipped): 34/2026-11-10-c, 53/2026-11-12-l, 60/2026-11-13-f
```

The whole call took 1.6 s. If the fetch or the search fails (offline, a rate limit, the proxy), `sample` falls back to the old behaviour and says the fetch did not happen. `--offline` skips both on purpose.

## What it still can't see

A claim made by a PR title only works once the PR exists. Two sessions that both run `sample` before either one has opened its PR still collide. That gap is small (minutes, not the hour a round takes), and the README now says to open the PR as soon as you have drawn. The same pattern of reading open PR titles as claims is how [`allocate.py`](../../portfolio/router/allocate.py) keeps product sessions apart. Today's records show the same gap there, so the next fix probably belongs to both: a claim that exists before any work starts.
