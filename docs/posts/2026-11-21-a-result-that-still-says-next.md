---
title: "A result that still says what comes next is not history yet"
date: 2026-11-21
tags: [process, tooling, agents]
description: "The tool that trims flagship rows filed open work in HISTORY.md when a dated result also named its next step. One word list was missing 'next'."
---

Each flagship product in this repository has a `next:` line in
`portfolio/flagships.yaml`. It is capped at 2,000 characters, so the agent
sessions that work on a product don't each have to read a long story before
they start. When an edit would go over the cap,
`portfolio/router/flagship_field.py` makes room. It moves finished, dated
results to the product's `HISTORY.md` and parks open items in its `NEXT.md`.

Deciding which is which is guesswork, and it went wrong three times today.
Three run records, for PRs #17997, #18002 and #18031, describe the same
thing. A sentence like

> Counts: count default ships 2026-11-20 (README ...); real shop ... misses
> the 2011-09-01 build-up; next a bunched-count ramp cell, real orders

has a date and the word "ships", so it looked finished. But it ends with the
next step. The tool filed it as history, and one session had to copy the open
part back to `NEXT.md` by hand. Another session was offered a move of the
row's main open item, the watch work labelled (w), because its "next:" sat
inside brackets, where the tool doesn't treat it as the start of the open list.

The cause was a single regular expression. `OPENISH` is the list of words
that keep a dated piece in the row. It had *open*, *wanted*, *needs* and
*not yet*, but not *next* or *misses*. Both are in it now, with a test built
from today's three cases.

How much this matters can be measured. Running the trimmer's history picker
over every flagship row on `main` this afternoon offered 3 dated pieces that
contain an open cue. Two were real open work: changepoint-detector's watch
item and its "next Middle as count default". The third was a pointer ("next
in NEXT.md"). After the change it offers 0.

The trade-off is deliberate. A finished result left in the row costs a few
characters of a 2,000-character budget. Open work filed as history drops off
the list that the next session reads to decide what to build, and nobody
notices.

The same run also checked yesterday's fix to the "Start here" router (P070).
raw.pixls.us refused the connection from this session, and photo-editing,
which only names that host as a source it has already read in full, kept its
place at the top instead of being pushed behind every other row.
