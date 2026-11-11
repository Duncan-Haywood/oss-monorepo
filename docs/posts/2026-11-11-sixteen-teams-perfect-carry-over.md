---
title: "Sixteen teams, perfectly fair: a schedule built from a finite field"
seo_title: "Round robin with perfect carry-over for 8, 16 or 32 teams"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, finite-fields]
description: "For 16 teams our carry-over search stopped 41% above the best possible value. A 1980 finite-field construction reaches it exactly."
---

*Carry-over* is about who you play straight after whom. If the Lions
are the strongest side, and the Hawks keep meeting teams the week after
those teams played the Lions, the Hawks get tired opponents again and again.
Russell's carry-over value (1980) squares and adds up how often each
"A, then B" sequence happens across the league. Lower is fairer, and the
fairest a schedule can be is every count at 0 or 1.

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has an option, "Spread who you meet next", that searches for a low value.
It starts from the textbook circle method and anneals. For most sizes that
works well. For 16 teams it was stuck at **316**, against a floor of **224**.

## Sixteen is a special number

When the number of teams is a power of two, the best possible schedule
can be written down directly. Label the 16 teams with the 16 four-bit
strings. Adding two labels is XOR. Then pick an element g of the field
GF(16) whose powers run through all 15 non-zero labels. In round r, team x
plays team x XOR g^r.

That is a round robin: XORing twice gets you back where you started, and
the pair {x, y} meets in the one round where g^r equals x XOR y. It is also
perfectly fair. Team t plays t + g^r and then t + g^(r+1), and those two
opponents always differ by g^r(1 + g). That difference tells you r, and r
tells you t. So every "A, then B" sequence happens for exactly one team.

Leaving one team out as the bye keeps the property, so 15 teams works as
well as 16 (and 7, 31).

## What changed in the tool

At 4, 8, 16 and 32 teams (and 3, 7, 15, 31) the search now starts from
this timetable. It tries every generator and every starting round (8 x 15
at 16 teams), which all have the same carry-over, and keeps the one with
the fewest back-to-back home or away games. Measured on seed 1
([table](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/league-schedule-generator/eval/field-start.txt)):

| Teams | Season | Before (carry-over / breaks) | Now | Least possible |
|---|---|---|---|---|
| 16 | single | 316 / 32 | 224 / 24 | 224 |
| 16 | home and away | 1,048 / 110 | 912 / 64 | 912 |
| 15 | single | 259 / 43 | 195 / 41 | 195 |
| 32 | single | 1,538 / 140 | 960 / 106 | 960 |

On the page itself, which runs ten searches and keeps a balance of
carry-over and breaks, a 16-team home-and-away season went from 1,220
carry-over with 54 breaks to **996 with 48**. It is better on both counts.

One thing broke along the way. The search's second pass trades carry-over
for fewer breaks using a quick greedy estimate of the breaks. From a
perfect start, that estimate sometimes gave away carry-over for breaks the
real home/away assignment never delivered (224 / 24 became 256 / 24). The
tool now scores both exactly and keeps the better one.

## What it does not do

Other sizes have no construction this simple in the code yet. Twelve teams
still search from the circle method and stop at 156 against a floor of 120;
whether 120 is reachable for 12 is not something we have checked. And the
practical question is still open: whether carry-over moves results in a rec
league at all. No organiser has used this feature yet.
