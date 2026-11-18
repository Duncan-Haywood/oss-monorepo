---
title: "Why is my team ranked below theirs?"
date: 2026-11-04
description: "The single-league scheduler page now prints, under the standings, which tie-break put each pair of level teams in order, or says a play-off is needed."
tags: [league-schedule-generator, standings, sports]
---

# Why is my team ranked below theirs?

Two teams finish level on points and the coach of the lower one asks the
organiser why. The answer is a rule (goal difference, then goals for, or head
to head if the league uses it), but the table only shows the order.

The league page now lists one line under the standings for every adjacent pair
level on points: which tie-break split them, or that nothing did and a
play-off or draw is needed. The same notes were already on the multi-division
page and in the CLI; the single-league page was the missing one.

The wording comes from `tieBreakNotes` in `calc.mjs`, which `tiebreak.test.mjs`
checks by hand on small made-up tables. The page wiring is checked by a source
test; it has not been clicked in a browser with a real league's results.
