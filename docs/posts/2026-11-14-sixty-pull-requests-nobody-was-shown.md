---
title: "Sixty pull requests nobody was shown: putting owner-held work in the daily brief"
date: 2026-11-14
tags: [process, tooling, ci, governance]
seo_title: "Sixty held pull requests the owner's daily brief never listed"
description: "A router fix waited three days for approval while the review track stayed dark for 3,232 runs. The daily brief now lists every PR that waits on the owner."
---

This repository's router, `prompts/promptctl.py route`, is supposed to send a run to the review track once 40 runs have merged since the last review. The review track is the part of the system that measures the other tracks and decides whether a new prompt beats the old one. Today the router printed this:

```
Why: weighted draw (process has weight 0.09 of 1; 3232/40 runs toward the next review)
```

So the last review ran on 31 October, and 3,232 runs have merged since then.

## Why the review never fires

When a review is due, the router first checks whether another session already holds it. It counts as held if any open pull request has a title starting with `prompts: review`. Three such PRs are open: #12026 from 31 October, and #12272 and #12367 from 1 November. Each one edits `prompts/`, which `.github/CODEOWNERS` lists as control plane. Each one says it waits for the owner's approval, and none of them has had it. While any of them stays open, the router treats the review as taken by a live session. That session ended two weeks ago.

The fix is already written. PR #14686 makes the router ignore a review claim older than 48 hours. It also edits `prompts/`, so it waits for the owner too. It has waited three days.

## Why nobody saw it

The owner reads two things: the decision queue (`portfolio/ledger/decision_queue.py`) and the daily engineering brief on the development dashboard. Neither one listed pull requests that wait on the owner's approval. The decision queue only reads its own data file, and the brief only gave a single count of every open PR. A local tool, `platform/ci/owner_held_prs.py`, lists the held PRs, but only for an agent that knows to run it.

Here is that list as of today, with the same CODEOWNERS rule applied to the live PR data:

- 103 open pull requests from this repository's own branches;
- 60 of them touch a control-plane path and wait on the owner;
- the oldest held PR has waited 38 days, and 22 of the 60 are less than a week old.

## What changed

Every publish already runs the dashboard collector (`platform/devstats/devstats.mjs`), and it already pages through the open PRs with the workflow's token. The collector now does three more things:

1. It reads `.github/CODEOWNERS` from the checkout, using the same pattern rules as `control_plane_guard.py`. The last matching line wins, and a line with no owner removes ownership, as it does on GitHub.
2. It asks for each same-repo open PR's file list, oldest PR first, up to 120 PRs.
3. It records `owner_held`: the count, and for each PR its number, title, age, the owned files and how many unowned files are stuck with it.

Fork PRs are never read. Their titles are anyone's text, and the dashboard already leaves them out. If the file lists can't be read, the collector records the reason in place of the block, and the rest of the snapshot still publishes.

The daily brief's "Decisions waiting on you" section now lists these PRs after the decision-queue rows, oldest first. It also flags a PR that holds unowned work alongside the control-plane change, since that work is stuck too. The watch list names the oldest held PR. A reading of zero says "No open pull request waits on your approval." A failed reading prints nothing, because an unmeasured count is not the same as zero.

## What this does not fix

The brief only shows the queue. It does not empty it. The review track will stay dark until the owner approves #14686 or closes the three stale review PRs. Many of the 60 are duplicates of one another: four PRs give ventures-tests a sparse checkout, and three change the same `prompt.md` step 0. `owner_held_prs.py` prints those groups, and reviewing each group together is the quickest way through.

The tests are in `platform/devstats/devstats.test.mjs` and `platform/daily/daily.test.mjs`. They cover pattern matching that mirrors the Python guard, oldest-first ordering, forks never being read, and a failed reading leaving the rest of the snapshot intact.
