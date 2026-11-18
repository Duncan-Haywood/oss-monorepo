---
title: "A time cap that holds, and why it didn't buy what I wanted"
seo_title: "Anytime search in shift scheduling: a time cap and a late gain"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "The second-call-out price in Shift Roster Builder now stops at a time limit and keeps the moves it made. On the bigger weeks the moves worth having came last."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an
opt-in price, `--second-callout-price`. It charges a roster for pairs of
call-outs that can each be covered alone but not together. It moves shifts
around until no move pays for itself. Every move it takes has been checked
by a full search over pairs of people's days, so each one lowers the
roster's cost: pay plus penalties, plus the hours at risk, plus the pair
hours, at your prices.

The catch has been speed. On one seeded 30-person week (121 shift copies),
the pass took 241 seconds earlier today. That is why it switches itself off
above 120 copies. The obvious fix was a time cap: stop at a limit and keep
the moves made so far. Because every move is a confirmed gain, stopping
between moves can never post a worse roster than the one the pass started
from.

That fix landed (`--second-callout-seconds`, default 10). Before lifting the
120-copy limit, I wanted to know how much of the gain a short cap keeps. So
I recorded when each move landed in the uncapped pass:

| seeded week | uncapped | when the moves land | gain kept at 10 s |
|---|---|---|---|
| 20 people, 75 copies | 4 moves, 2 s | 0.4 to 1.5 s | 100% |
| 30 people, 121 copies | 6 moves, 302 s | first one at **80 s** | 0% |
| 40 people, 149 copies | 11 moves, 20 s | one at 0.5 s, the big ones at 11 to 19 s | 22% |
| 60 people, 245 copies | 0 moves, 88 s | none | nothing to keep |

The cap itself works. Every capped run ended within a second of its limit,
and every capped roster was exactly the uncapped pass cut after its first
few moves. One check caught a real hole. The starting roster's own pair
count ran before the clock started, and on the 30-person week that count
alone took 8.5 seconds. Now it counts against the limit. If it can't finish,
the week is priced on single call-outs only, and the output says so.

What I hoped for didn't happen. On these weeks the search does not find its
best moves early and then polish. On the 40-person week, moves 4 to 11 carry
78% of the gain and arrive between 11 and 19 seconds. On the 30-person week
the first 80 seconds go to about 105 pair checks over 90,000 pairs, nearly
all of them for moves that end up refused. A 10-second cap above 120 copies
would mostly spend 10 seconds to keep a fifth of the gain, or none of it.

So the 120-copy limit stays. The cap is now a worst-case bound on the weeks
below it, which finish in 2 to 3 seconds anyway, so it changes nothing there
except that the page can't hang. If you want the full search on a bigger
week, `--second-callout-seconds 300` gives it the time.

The next step is now clear: make the pass find its gain sooner. It tries
candidates in a fixed order. If it tried first the ones whose cheap check
clears the most pair hours, a short cap would keep more.

Caveats: these are invented teams and seeded weeks, timed in single runs on
one 4-core cloud machine. A capped result depends on the machine's speed, so
unlike an uncapped one it won't reproduce exactly elsewhere. The output
flags it (`pairTimedOut`). The numbers, the eval script and the tests are in
the venture's README under "A time cap on the pair price".
