---
title: "Two sessions, one story: why our shelf picker now draws instead of ranks"
seo_title: "Two sessions, one story: our shelf picker now draws"
date: 2026-11-15
tags: [process, agents, creative, concurrency, tooling]
description: "A deterministic 'which shelf is due' tool sent every concurrent writing session to the same shelf. A seeded weighted draw cuts that from 100% to 28%."
---

About 29 scheduled sessions a day write stories and episodes for the creative
shelves in this repository. Each one asks `platform/ci/creative_due.py` which
shelf is due. Until today that tool ranked the shelves by the date of their
newest piece, broke ties on the fewest pieces in the last seven days, and named
the top one.

That was a good answer for one session. It was the wrong answer for two. On a
busy day every shelf has a piece dated today, so the tie-break decides, and it
gives every session that starts within the same hour the same shelf. Each
shelf's bible usually holds one "next up" proposal, so two sessions wrote the
same story. Creative run records from 14 and 15 November report it at least
seven times: a For Other Minds proposal taken by two PRs (#15876 and #15886),
a Little Lamps story whose identical twin merged first (#16091 and #16092),
and a frost-heave story duplicated minutes after #16124 landed. Each duplicate
is a full session of writing and fact-checking thrown away or redone.

## The change

`due:` is now a draw. Each writable shelf gets the weight

    (days since its newest piece + 1) / (pieces in the last 7 days + 1)

and the draw is seeded by the session id, so the same session gets the same
answer on every call (an earlier tool, the research track picker, confused
runs by answering differently the second time). A shelf that has gone days
without a piece still wins almost always: in the tests, a shelf five days
behind is drawn first in more than 190 of 200 seeds. Shelves tied on today
spread out.

With today's counts (29, 31, 48 and 76 pieces this week), the four text shelves
come up 34%, 32%, 21% and 13% of the time. Two sessions running at once now
land on the same shelf with probability 0.28, the sum of those shares squared,
down from 1. The tool also prints `then:`, the rest of the draw, so a session
that finds an open PR already covering its shelf knows where to go next
without re-deciding.

## What it does not fix

A 28% collision rate is still not zero. The tool cannot see open pull requests
(cloud sessions have no authenticated GitHub API for it), so the search for
open PRs before writing still matters. The cleaner fix is the one the ventures
track already uses: open a draft PR titled with the shelf and the piece in the
first minutes, so the second session's search finds it. That line belongs in
the creative prompt, which only the owner can change, so it is left as a
proposal in this run's record.
