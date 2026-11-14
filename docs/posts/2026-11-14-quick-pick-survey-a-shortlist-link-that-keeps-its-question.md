---
title: "A shortlist link that keeps its question"
seo_title: "How many comparisons to find the top 3: a shareable pairwise shortlist"
date: 2026-11-14
description: "The ranker's 'find my top k' mode got the exact top 3 of 20 right 12 times in 16, against 4 for the full order. Its link dropped the question. Now it doesn't."
tags: [quick-pick-survey, pairwise-comparison, top-k, product, seo]
---

Earlier today the free [list ranker](https://marisstella.app/quick-pick-survey/rank.html)
got a "find my top k" mode. Most people don't need a whole order of twenty
things. They need the three features for the quarter, the three names to test,
the three customer problems to fix first. The new mode asks about the options
that could still fall either side of the cut, and stops when the shortlist is
settled rather than the whole order.

On simulated people it worked: for someone of ordinary consistency choosing a
top 3 from 20 options, the shortlist mode named the exact true top 3 in 12 of
16 runs after about 161 picks. Ranking the full order and reading off its
first three got 4 of 16 after 86 picks. Over 15 to 30 options and top 3 or
top 5, it was 54 of 96 against 25, at about 1.6 times the questions.

## The link forgot the question

The ranker is built for teams: you paste a list, answer, and send the link;
everyone answers on their own phone and sends back a result code. The list
lives in the link's `#` fragment, which browsers never send to a server.

The fragment held the title and the items, and nothing else. So a product lead
who set up "find our top 3" and sent the link got back codes from people who
had each ranked the full order. The mode that gets the shortlist right twice
as often was used by exactly one person on the team.

Now the fragment carries the mode and k. Three details mattered:

- **A full-order link is byte-for-byte unchanged.** The mode is added only
  when it is not the default, so every link already sent, and every ready-list
  page, still opens the same way.
- **k is checked against the list it arrives with.** The ranker removes
  duplicate options, so a top 3 of `a, a, b, c` is a top 3 of three, which
  leaves nothing out. A k that does not fit, or a mode this version of the
  page does not know, is not quietly turned into something plausible: the
  list opens in the full order and the page says why, above the first
  question. That is the codebase's own rule ("reject, don't coerce"), learned
  when a silent fallback once recorded one survey perspective as another.
- **The respondent is told.** "Whoever sent this link asked for your top 3:
  the questions go to the options near the cut." Otherwise the questions look
  oddly concentrated on a few options.

## The numbers, where people look for them

The ranker's status line used to say "a shortlist takes more picks than the
full order" with no figure. It now quotes the measured means for the nearest
measured cell, for example: a top 5 from 12 options took about 49 picks for
someone sure of every answer, 69 typically and 80 for close calls. When it
borrows a different k or list length, it says so.

The [how many pairwise comparisons](https://marisstella.app/quick-pick-survey/how-many-pairwise-comparisons.html)
page, which answers the question for whole orders, now has the shortlist
table too: every measured cell, full order against shortlist mode, with how
often each got the exact shortlist and how often it ran into the question cap.
Two results are worth knowing before you use it:

- **Someone who is sure of every answer pays about 20% more questions** for a
  shortlist the full order had right 91 times in 96 anyway.
- **Close calls on long lists mostly hit the cap and are still mostly wrong**
  (23 of 96 right, against 12). If your answers don't hold a firm cut, no
  picker can find one; the result shows each option's chance of being in
  instead of pretending.

Everything on that page is generated from the sweep's rows, and a test fails
if the page and the data drift apart.

Three ready lists (a [feature backlog](https://marisstella.app/quick-pick-survey/use-feature-backlog.html),
a [name shortlist](https://marisstella.app/quick-pick-survey/use-name-shortlist.html)
and [customer pain points](https://marisstella.app/quick-pick-survey/use-customer-pain-points.html))
now offer a "find your top 3" link next to the full ranking.

## What this doesn't show

The numbers are from simulated people with evenly spaced preferences, no
fatigue and no ties. Only k = 3 and 5 were measured. Whether real teams pick
the shortlist mode, and whether their answers behave like the simulation,
needs real use; the page counts which mode people choose and whether the
ready-list shortlist links are clicked, locally and anonymously.

The method and every check: [docs/RANK-PAGE.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md),
"Shortlist links and the shortlist's numbers".
