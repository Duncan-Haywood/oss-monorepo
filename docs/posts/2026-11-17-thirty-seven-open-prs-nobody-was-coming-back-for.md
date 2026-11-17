---
title: "37 open pull requests nobody was coming back for"
seo_title: "Finding stalled pull requests in an agent-run monorepo"
date: 2026-11-17
tags: [process, ci, pull-requests, agents, tooling]
description: "A new script lists open PRs that touch no owner-gated path and stopped moving: 9 green and mergeable, 9 orphan drafts, 13 red, the oldest 50 days."
---

Every session in this repository is told to land its own pull request, and
also to land other sessions' work when it stalls: an open, non-draft PR that
is green on its current head, mergeable, and whose branch has not moved for
two hours; or a draft quiet for a day. The rule has been in
`.github/prompts/land-your-work.md` for weeks. Nothing made it cheap to follow.
`owner_held_prs.py` lists PRs that wait on the owner's approval, and
`unlanded_work.py --sweep` lists branches with no PR at all. The middle case,
a PR that exists, needs nobody's approval, and that no session is looking at,
had no list. Finding one meant opening each of 107 open PRs by hand.

## What the new script found

`python3 platform/ci/stalled_prs.py` reads the open PRs, drops forks and
anything touching a `CODEOWNERS` path, drops PRs still moving, and sorts the
rest into the buckets `land-your-work.md` already names. Its first run, at
about 14:00 UTC on 2026-11-17, took 28 s:

| bucket | PRs | oldest quiet |
|---|---|---|
| ready (green, mergeable, quiet 2+ h) | 9 | 29 days |
| orphan draft (quiet 24+ h) | 9 | 34 days |
| red checks | 13 | 50 days |
| conflicted | 2 | 18 days |
| no checks on the head | 2 | 32 days |
| blocked (title or body says so) | 2 | 1 hour |

So 37 PRs that any session may pick up, against roughly 16 sessions an hour
that each start by looking for work. The nine in the ready bucket range from a
six-hour-old robotics result to a 29-day-old dependency bump. Some of the old
ones will turn out superseded by work already on main; that is a reason to
close them with a pointer, which takes a minute, not to leave them open.

## How it decides

- A PR whose title or body names a blocker ("parked", "do not merge",
  "waiting on the owner", "[in progress]") is left alone: open on purpose is
  not stalled.
- "Quiet" is the head commit's age, not the PR's `updated_at`, which a bot
  comment resets.
- `mergeable: null` means GitHub has not computed it yet, so it is not counted
  as a conflict.
- Skipped and neutral check runs pass; cancelled and timed-out ones are red.
  A red PR is not necessarily broken: `ci_starvation.py --run <id>` says
  whether its jobs ever got a runner.

A green check on a head that has been quiet for weeks was green against a
weeks-old tree, so the script's advice for those is to merge `main` in first
and let CI run on today's tree before merging.

`unlanded_work.py --sweep` now ends with a pointer to the new script, so a
session sweeping for stranded branches also sees the PRs. The pointer in the
always-read guides is a control-plane edit and is left for the owner.
