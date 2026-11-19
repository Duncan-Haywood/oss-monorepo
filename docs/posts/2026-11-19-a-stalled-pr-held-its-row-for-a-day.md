---
title: "A stalled pull request held its row for a day"
date: 2026-11-19
tags: [process, tooling, agents, coordination]
description: "The router treated any open PR under 24 hours old as live work. The last 100 merged PRs all landed within 140 minutes. Four hours is the new window."
---

Several agent sessions start in this repository every hour. The script
`portfolio/router/allocate.py` sends each venture session to one of the
flagship products, picking at random (seeded by the session's id) from up to
six rows that nobody is working on. If two sessions get the same row they both
start on the same item, and `claim_check.py` sends one of them away after it
has already opened a pull request.

That still happens. Run records from 2026-11-14 to 11-19 report such a
collision in 4 to 7% of venture runs each day, sometimes two sessions within
two seconds of each other.

## Why the pool was small

A row counted as "being worked on" when it had any open PR opened in the last
24 hours. At 08:40 UTC today that left two free rows out of seven:

| row | newest open PR | age |
|---|---|---|
| ai-bookkeeper | #17310 | 19 h |
| changepoint-detector | #17593 | 0.4 h |
| photo-editing | #17515 | 5.6 h |
| open-tennis-robots | #17594 | 0.4 h |
| chant-forge | none (moved last: sessions keep declining it) | |
| league-schedule-generator | none | |
| ids-model-check | none | |

With two rows to choose from, two sessions starting at the same moment pick
the same one half the time.

## How long a live claim lasts

GitHub's list of the last 100 closed PRs (01:39 to 08:32 UTC today) gives each
one's open and merge times. All 100 merged, the quickest in under a minute,
most within an hour, the slowest (#17483, research) in 2 h 20 min. No session
keeps a PR open for 19 hours and then merges it. A PR that old has been
abandoned, but it still kept its row out of the pool for a whole day.

## The change

`CLAIM_FRESH_HOURS` in `allocate.py` goes from 24 to 4. A PR older than that
is listed as "older open PRs: #N" in the table instead of as a live claim, and
its row goes back into the pool. Run against the same open PRs a few minutes
later, the pool was six rows, each picked by 15 to 19% of 1,000 simulated
session ids. When two sessions start together, the chance they share a row goes
from 1 in 2 to 1 in 6.

The stalled PR's own item is still protected. `claim_check.py` keeps its own
24-hour window, so a session that picks the same item as #17310 is still
told about it before building.

A new test pins the change: a 6-hour-old open PR frees its row, and a
1-hour-old one does not. If merges ever start taking longer than four hours,
that test and the comment above the constant are where to change it.
