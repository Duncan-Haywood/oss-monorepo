---
title: "Parallel AI coding agents: duplicate pull requests, stranded branches, and how we land the work"
seo_title: "Parallel AI coding agents"
date: 2026-10-20
description: "Sixteen AI agents sharing one main branch left 186 commits in no pull request and closed each other's work. The checks and rules that fixed it."
tags: [ai-agents, git, pull-requests, process]
---

# Parallel AI coding agents: duplicate pull requests and stranded branches

About sixteen AI coding agent sessions work on this repository at once,
around the clock. They run on a schedule, start with no memory of each other,
and an owner steers the whole thing a few hours a week. Each session picks a
task, pushes a branch, opens a pull request and merges it itself.

Two failures follow from that setup, and neither shows up as a red check. Work
gets pushed and never reaches a pull request. And two sessions doing the same
thing close each other's work. This post covers both, from the repository's
own records: [`docs/parallel-agents.md`](../../docs/parallel-agents.md),
[`platform/ci/unlanded_work.py`](../../platform/ci/unlanded_work.py),
[`portfolio/ledger/supersede_check.py`](../../portfolio/ledger/supersede_check.py),
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md)
and the incident record in
[`docs/history/claude-md-2026-10-15.md`](../../docs/history/claude-md-2026-10-15.md).

## Failure 1: work that stops at `git push`

Opened pull requests land. In the two weeks to 5 October, 1,251 merged and 23
were closed unmerged. The leak was one step earlier.

Measured on 5 October over branch tips dated 21 September onward: **102
branches held 186 commits that were in no pull request and not on `main`**,
and 100 of those branches never had a pull request at all. Four of them were
complete, tested products that `main` did not have:
`sep-ira-contribution-calculator`, `recipe-costing-calculator`,
`s3-bucket-exposure-check` and `agent-permission-config-check`. Each was
built, committed and pushed, and then the session ended.

Nothing reported it, for a structural reason. Every guard in the repository
runs on a pull request or on `main`. A branch with no pull request is
invisible to all of them, to branch cleanup, and to the next session. A
session that stopped at `git push` got the same silence as one that shipped.

### The fix: make the silence an exit code

`unlanded_work.py` answers one question from git alone, with no token: is any
commit on this branch reachable from neither `main` nor any pull request's
head ref? GitHub publishes `refs/pull/<n>/head` for every pull request ever
opened, so a commit outside all of those is one nobody can find without
already knowing the branch name. Merge commits are ignored, and squash merges
need no special case because the pull request's head ref still holds the
branch's commits.

```
python3 platform/ci/unlanded_work.py            # this branch; exit 1 = open a PR
python3 platform/ci/unlanded_work.py --sweep    # every branch, last 14 days
```

Three more changes went with it:

- **Open the pull request on the first push, as a draft.** A session that dies
  after that leaves something the next one can find. One that dies before
  leaves an orphan.
- **Merging is every agent's job.** A ready pull request with green checks
  whose branch has not moved in two hours can be merged by any session. A
  draft untouched for 24 hours is an orphan to finish or close with a reason.
- **A scheduled adopter.** `adopt-stranded-branches.yml` runs every six hours
  and opens a draft pull request, at most ten per run, for each branch a
  session pushed and left. Its header records that on 15 October, 122
  branches with tips since 15 September carried commits in no pull request,
  and 40 of them held files only they had changed.

The tool and the landing prompt merged on 5 October (#6402). All four
stranded products from that day's list reached `main` within three days:
the two security checks in #6501 on 7 October, and the IRA and recipe
calculators in #6581 and #6563 on 8 October (from `git log origin/main`). A sweep
run for this post on 20 October, over tips since 6 October, found **4
branches carrying 5 commits** in no pull request. Three have tips from today and may
belong to sessions still running, so read that as a ceiling on the leak, not
a final count.

## Failure 2: sessions closing each other's work

Scheduled sessions overlap, and two of them often pick the same idea. The
obvious response is to close the duplicate. That is where it went wrong.

**The 38-second double close.** On 24 August a bot closed #948 as "superseded
by #953" at 16:04:20. Thirty-eight seconds later another session closed #953
"in favour of #948". Two complete implementations of the same browser
calculator, and neither shipped until #948 was reopened.

The rule that came out of it: before closing a pull request in favour of
another, check the survivor is still open, immediately before and after. If
the one you deferred to is already closed, reopen one rather than writing a
third.

**"Already on main" when it was not.** The same afternoon, between 17:24 and
17:25, sessions closed #1006, #1014 and #1016, each as already represented on
`main`. None of them were. `main` had no `share.mjs`, no `compareFeeScenarios`
and no `calculatePriceScenarios`. Getting the work back cost more sessions.

### The fix: prove supersession from git

`supersede_check.py` decides whether closing a pull request would drop work
that exists nowhere else. It uses two independent proofs, and either one is
enough for exit 0:

1. **Line scan.** Lines the branch adds, minus lines already present anywhere
   in `main`'s tree. If nothing is left, the close is safe. If something is,
   the tool prints it.
2. **Identical-merge proof.** Replay the branch on `main` with `main` winning
   every conflict. If the result is `main`'s tree exactly, the branch adds no
   content.

The second proof exists because the first went quiet. On 27 August the line
scan said NOT SUPERSEDED for 65 of 66 open pull requests, because sibling
branches kept landing the same feature under different file names. A gate
that never opens is one nobody uses. The tool now also prints a **RENAME
SUSPECTED** section when most unmatched lines have a close twin on `main`
under other identifiers. That is evidence to read, not a licence to close.

Two rules sit beside the tool. **Overlap is not supersession**: touching the
same product or file as recent work is normal here. And **a conflict is not a
reason to close**: merge `main` into the branch and resolve it. The history
file records three such branches that all resolved in minutes, and one
resolution found a live bug where a shared link silently dropped two fields.

## The cost that remains: shared files

`docs/parallel-agents.md` measured the concurrency cost directly on 16
October, over the 433 pull requests from #6800 to #7234:

| Measure | Value |
|---|---:|
| Pull requests that had to merge `main` back in at least once | 39% |
| Their own commits | 692 |
| Merge-main commits on top | 223 |
| Housekeeping commits among the 692 (mirror regeneration, count syncing, conflict repair) | 201 |
| Share of all commits that are concurrency tax | 46% |
| Pull requests closed unmerged, 1 to 15 October | 50, against roughly 900 merged |

Most of that tax comes from shared registries and whole-tree counters that
every new product edits. 84% of pull requests since 2 October touched the
regenerated mirror under `gitops/prod/`, which serves the retired cluster
origin and nothing live. The document's proposed fixes, in order: get the
always-red `Portfolio validate` check green, stop committing the dead mirror,
derive counters instead of pinning them, and move per-product registrations
into each product's own directory.

## What we would tell another team running parallel agents

- Treat a pushed branch with no pull request as a failure, and give it an exit
  code.
- Open the pull request first, and let any agent finish a stalled one.
- Never close as "superseded" on judgment. Prove it from the tree.
- Re-check the survivor before and after you close.
- Expect shared counters and registries to be where parallel work collides,
  and design them out.

These are lessons from one repository, measured with its own tools, not a
general study of multi-agent development.
