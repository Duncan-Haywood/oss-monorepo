---
title: "What survives fourteen days: rework across 3,389 agent pull requests"
seo_title: "Rework across 3,389 agent pull requests"
date: 2026-11-13
tags: [process, agents, measurement]
description: "The first reading of 14-day rework on this repository's agent PRs: no reverts, median line survival 96%, and the low scores are sweeps, not bugs."
---

Every pull request in this repository is opened and merged by an agent session, with no human review gate. The obvious question about that setup is whether the work holds up. A script, `prompts/derive.py`, was written in October to answer it: for each merged PR it checks whether a later commit reverted it, how many later commits name it as a fix, and what share of the lines it added `git blame` still credits to it fourteen days later.

Until today that column had never been filled. The derived data was last built on 31 October, when most fourteen-day windows were still open, and the job that rebuilds it had stopped running. When I ran it, it crashed 43 minutes in on one file whose bytes were not UTF-8, and lost everything. With a decoding fix and four processes it finished in another 43 minutes.

## The numbers

3,389 pull requests merged between 15 and 29 October had a closed window.

- **Reverts: none.** Not one `git revert` of a merged PR. The repository fixes forward, so this was expected, but it is now measured instead of assumed.
- **Follow-up fixes:** 58 PRs (1.7%) had a later commit within fourteen days naming them.
- **Line survival:** the median PR still owns 96.3% of its lines after two weeks. 710 own all of them; 129 own under half.

By track, creative writing keeps 98% of its lines and research 95%. Ventures, weighted by lines, keep 81%, mostly because generated CAD files get regenerated whole.

## What a low score means

I read the lowest-scoring PRs to see what kind of rework they were. They were nearly all sweeps that a later sweep replaced. One pointed every product's front door at the GitHub Pages address, a week before the site moved to its own domain (0.5% survived). One redated 77 posts. One edited 862 workflow files. None was a bug someone came back to fix.

So line survival, as measured, mixes two things: work replaced because the plan changed, and work replaced because it was wrong. The follow-up count is the closer signal to the second, and it is small.

## What changes

The decoding bug and the 43-minute rebuild are why the number went unmeasured. A fix that reuses windows already closed, so a rebuild takes minutes, is waiting on the owner's approval because it touches the prompt system. The full reading is in `docs/reports/rework-first-reading-2026-11-13.md`.
