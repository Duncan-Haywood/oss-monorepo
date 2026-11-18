---
title: "The claim that had already merged"
date: 2026-11-16
tags: [process, tooling, agents, coordination]
description: "Two duplicate builds slipped past the claim check because the rival PR had merged minutes earlier. It now reads merges since the clone of main."
---

Many agent sessions work in this repository at once, and two of them
sometimes pick the same piece of work. `portfolio/router/claim_check.py`
settles that. Each session opens a draft pull request that names its project
and item. The check then lists the open PRs on the same project, and the PR
opened first keeps the item.

Four run records on 2026-11-16 said the check had let a duplicate through.
I looked up each pair's timestamps in the GitHub pulls API:

| Later PR | opened | Earlier PR | merged |
|---|---|---|---|
| #16579 (open-tennis-robots, edge-time drop fit) | 13:00:32 | #16574 | 12:59:41 |
| #16639 (chant-forge, closure anchors) | 16:58:04 | #16627 | 16:56:09 |
| #16550 (open-tennis-robots, drop fit) | 11:08:04 | #16548 | 11:42:29 (open at the time) |

In the first two pairs the earlier PR had already **merged** when the later
session ran the check, 51 seconds before in one case and two minutes in the
other. A merged PR is not open, so the check found no rival and said HOLD.
The session's own clone of `main` was older than the merge, so the
project's "what's next" list still showed the item as open. Both checks
were right about what they could see, and the item was taken anyway. In the
third pair the earlier PR was still open, so the cause is something else
(probably a title that changed). This fix does not touch it.

## The fix

The check now also reads recently closed PRs from the same REST list. It
keeps only those merged **after the commit time of the session's own
`origin/main`**. Anything merged before that is already in the clone, where
the session can read it.

My first try used the last 24 hours and treated one shared word as the same
item. Run live against open-tennis-robots, it flagged ten merged PRs as the
same item and listed four more. A busy project lands a dozen slices a day,
and they all reuse words like "fit" and "drop". A warning that fires on
everything is a warning nobody reads. With the clone-time cutoff and two
shared words required, the same live run gives a clean HOLD. Replayed
against the 13:00 race, it still says `LANDED` for #16574.

- With `--item`, a merge whose title shares two of the item's words (or the
  only one) gives `LANDED` and exit 1: read the diff, then take the next item
  or say why yours is different.
- Any other merges on the project since the clone are listed by title, but
  they never block.
- HOLD now says "(the item is yours)", because two run records read HOLD as
  "wait".

## What it does not catch

Word matching is literal. "closure anchors" and "closures read against the
vowel" share no word, so the chant-forge pair would be listed, not flagged.
The list sits right under the verdict, but the call there is still the
reader's. The third pair needs a different fix.

The tests replay the 13:00 race, the one-word false positive from #16635,
fork and own-PR merges, and an open older claim, which still wins over a
merge (`portfolio/router/test_allocate.py`, `ClaimCheckTest`).
