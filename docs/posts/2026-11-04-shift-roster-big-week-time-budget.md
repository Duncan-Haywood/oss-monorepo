---
title: "A 392-shift week took over two minutes to roster. Now it stops at 20 seconds."
seo_title: "Employee scheduling software time limit for large weekly rosters"
date: 2026-11-04
tags: [shift-roster-builder, scheduling, performance]
description: "Our free shift roster builder ran for more than 110 seconds on a 60-person, 392-shift week with no output. A wall-clock budget fixes that, and we say when it was hit."
---

The free [shift roster builder](https://marisstella.app/) accepts up to 60 people
and 400 shifts. We had only tested hostile files that were refused; we had not timed a
week that is allowed but large. We built one: 60 people, 56 shift lines a week, seven
people needed on each, 392 shifts in all.

It ran for more than 110 seconds before we stopped it, printing nothing. The solver
is a chain of passes (annealing, ejection chains, twelve plateau walks, an exact
check), and each is tuned to keep going while any shift is open. On a week where
people are the limit, some shifts will always be open, so every pass ran in full.

The fix is a wall-clock budget. Weeks with more than 150 shifts get 20 seconds of
improvement passes; after that the best roster so far is returned and the result says
`budgetHit: true`. Smaller weeks, including every guide page example, run as before.
The same 392-shift week now finishes in 21.7 seconds with 300 shifts covered, which is
all 60 people can work at five shifts each.

What we have not shown: that 20 seconds loses nothing on big weeks that are coverable.
On the one week we timed, capacity was the limit, so the budget cost nothing. A slower
machine also stops earlier. If you run the builder on your own server, `timeBudgetMs`
sets it, and 0 turns it off.
