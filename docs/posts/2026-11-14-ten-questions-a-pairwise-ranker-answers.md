---
title: "Ten questions a pairwise ranker answers better than a score sheet"
seo_title: "Pairwise ranking use cases: OKRs, MaxDiff, to-do lists, weddings"
date: 2026-11-14
tags: [quick-pick, pairwise-comparison, seo, product]
description: "Quick Pick now has ten ready lists, from team goals to a free MaxDiff-style pain-point ranking, plus a hub. What each replaces, and what it does not do."
---

[Quick Pick's rank page](https://marisstella.app/quick-pick-survey/rank.html)
does one thing. You paste a list and answer "this or that?" a few dozen times.
You get back an order, with a 90% rank range for each place. Send the list to
other people and paste their result codes back, and it combines everyone's
picks into one order. Nothing is uploaded.

Nobody searches for "pairwise comparison ranker", though. People search for the
job they're stuck on. So this morning the site got four
[ready-list pages](https://marisstella.app/quick-pick-survey/ready-lists.html):
a feature backlog, personal values, a name shortlist and a group trip. Each one
opens the ranker with a starter list already filled in. This afternoon added
six more:

| Page | The usual answer | Why a pair works better |
|---|---|---|
| [Team goals or OKRs](https://marisstella.app/quick-pick-survey/use-team-goals.html) | dot voting, 1 to 5 scores | scores bunch at the top; picking between two goals forces the trade-off |
| [Customer pain points](https://marisstella.app/quick-pick-survey/use-customer-pain-points.html) | a paid MaxDiff module | the same forced choice, free, for a handful to a few dozen people |
| [Wedding priorities](https://marisstella.app/quick-pick-survey/use-wedding-priorities.html) | budget worksheets | starts from what each partner would give up, not from prices |
| [House-hunting must-haves](https://marisstella.app/quick-pick-survey/use-home-must-haves.html) | yes/no checklists | tells you which "yes" to trade away |
| [Book club's next read](https://marisstella.app/quick-pick-survey/use-book-club-next-read.html) | a show of hands | uses everyone's whole order, not one vote each |
| [A to-do list](https://marisstella.app/quick-pick-survey/use-todo-priorities.html) | an Eisenhower matrix | comparing two tasks is easier than labelling each one alone |

Every page also says what the tool doesn't do. The pain-point page is the
clearest case. Respondents send their codes back by hand, so it doesn't replace
a survey panel. The ranking only reflects how you worded each problem, so write
them in the customer's words. The wedding and house pages rank what people care
about, not what things cost.

## The hub

The site also has a [hub page](https://marisstella.app/quick-pick-survey/ready-lists.html)
that lists all ten, each with a one-click start. Every ready-list page links
back to it, and so do the landing page, the rank page and the
[how-many-picks page](https://marisstella.app/quick-pick-survey/how-many-pairwise-comparisons.html).
A crawler that finds any one of them can reach the rest.

## How the pages stay correct

The pages are generated from one file, `scripts/build-use-pages.mjs`. Each
start link carries its list after the `#`, encoded by the ranker's own
encoder, so the list never reaches a server. Tests fail in three cases: a page
or the hub doesn't match the generator's output, a link doesn't decode back to
its own list, or a page loses its link to the hub. We checked that the hub test
really fails by deleting the hub file. We also loaded the seven new pages in
Chromium at phone width: none of them scrolls sideways.

## What we don't know yet

Whether anyone arrives. The pages count anonymous views and starts in each
visitor's own browser, so nothing reaches a server. Search traffic is a
separate reading we haven't taken yet. That's the next step: find out which of
the ten questions brings people in, and write more pages like that one.
