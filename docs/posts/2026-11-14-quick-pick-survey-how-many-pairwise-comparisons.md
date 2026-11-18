---
title: "How many pairwise comparisons does it take to rank a list? We measured it"
seo_title: "How many pairwise comparisons to rank n items: measured"
date: 2026-11-14
description: "Every pair once is n(n-1)/2 questions. An adaptive ranker needed 93 picks for 20 options and 204 for 40, for an order nearly as good. Short lists differ."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, active-learning, statistics, product]
---

"Which do you prefer, A or B?" is the easiest question to answer about a
list. The catch everyone hits next is the count. Asking every pair once is
n(n-1)/2 questions: 45 for ten options, 190 for twenty, 1,770 for sixty.

The free [list ranker](https://marisstella.app/quick-pick-survey/rank.html)
doesn't ask every pair. After each answer it refits a Bradley-Terry model
and asks the pair whose answer should tell it the most, and it stops when the
order is 90% settled. Its status line told people "lists of n usually take
n log2 n to 1.5 n log2 n picks". That was a guess. Nobody had measured it.

So we ran the page's own code (its question picker, its stop rule, its cap)
on simulated people: 24 per cell, lists of 4 to 60 options, three kinds of
answerer. Clear-cut people never pick against their own order. Ordinary
people pick their favourite over their least favourite 998 times in 1,000
but find neighbours on a 15-option list a 61/39 call. For close-call people
that is 95 in 100 and 55/45. For each simulated person we also asked every
pair exactly once and refit the same way, so the two methods are compared
on the same person.

## What came out

| Options | Every pair once | Ranker, ordinary | Order (Spearman): ranker / every pair |
|---|---|---|---|
| 5 | 10 | 21 | 0.98 / 0.88 |
| 10 | 45 | 48 | 0.95 / 0.92 |
| 20 | 190 | 93 | 0.94 / 0.95 |
| 40 | 780 | 204 | 0.92 / 0.97 |
| 60 | 1,770 | 366 | 0.94 / 0.98 |

Three things surprised us.

**On short lists the ranker asks more than every pair, and it is worth it.**
Below 12 options it re-asks the close pairs to be sure of them, so it asked
21 questions on a 5-option list where every pair is 10. We expected that to
be waste and tried a fix: stop as soon as every pair has been answered once
with no contradiction. It barely ever fired, because the picker re-asks
neighbours rather than covering every pair, and where it did fire it cost
accuracy. The extra questions turned out to buy a better order: 0.98
against 0.88 at 5 options, 0.07 Spearman on average below 12. We dropped
the fix.

**On long lists, every pair once is more accurate. It is also unaskable.**
From about 15 options up, a full round beats the ranker's order (0.97
against 0.92 at 40 options). It takes 780 questions to get there. The ranker
takes 204, about a quarter. For anything a person will actually sit
through, adaptive wins.

**A consistent person goes under the "sorting minimum" on long lists.**
log2(n!) is the fewest comparisons that can sort a list exactly: 160 for 40
items. The ranker stopped at 150 for a never-wrong person, and at 229 against
273 for 60. It's not beating information theory. It stops at an order that is
90% settled (Spearman 0.99), not exact.

Close calls are the expensive case. At 4 to 6 options, 78% of close-call
runs reached the cap without the order ever reaching 90%. That is the right
answer, not a failure: those answers don't contain a firm order, and the
results page says so with wide rank ranges.

## What changed on the page

The status line now reads the measured numbers ("Lists of 15 took about 51
picks for someone sure of every answer, 73 typically and 104 when the
options are close calls, in simulations"). The old range was about right for
consistent people on mid-length lists and too low for close calls: it said
59 to 88 for 15 options. The full table is on a new page,
[How many pairwise comparisons does it take to rank a list?](https://marisstella.app/quick-pick-survey/how-many-pairwise-comparisons.html).
Every number and every verdict sentence on that page is generated from the
measured rows, so it can't drift from the data.

## Limits

These are simulated people with evenly spaced likes and no "about equal"
answers. Real people tire, warm up and favour one side of the screen, and
none of that is in here. The favourite-only mode wasn't measured. The script
is `scripts/picks-needed.mjs` and the rows are
`docs/picks-needed-2026-11-14.jsonl` in the
[repository](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/quick-pick-survey).
Rerun them, or point them at a different answerer.
