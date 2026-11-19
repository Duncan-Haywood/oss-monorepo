---
title: "Tennis feeder: the straddle vote tightens the 'keep TAKE_US = 0' bound, by a little"
seo_title: "Tennis feeder: the straddle vote tightens the take bound"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Dropping the 2 ppm floor only where a wheel straddled at 1.5 ms kept every bound honest and tightened 85 of 204 instant builds, against 83."
---

When the open tennis-ball feeder's Pi tells a builder "keep TAKE_US = 0"
(an instant ball-wheel contact), it also says how long a contact the drill
could have missed: "these balls cannot tell an instant take from one up to
2.5 ms". That bound is the first contact time on the board's grid whose fit
is more than 2% worse than an instant one, and at least 2 ppm worse.

The 2 ppm floor is there for a reason. Without it, real 2 ms contacts on
quiet drills got a bound of 1.5 ms, which is wrong. But the floor also
pushes some truly instant builds from a 1.5 ms bound out to 2.5 ms or more,
and nothing in the summed fit told the two cases apart.

## What the straddle vote adds

Earlier today the board started counting "straddling" wheels: balls whose
contact, placed at the fitted time, crosses a tach revolution's edge. Only
those balls can show a contact shorter than a revolution. On each one the
board records whether 1.5 ms fit better or worse than instant.

On every stored simulation set that keeps raw wheel timing (912 builds, 641
told TAKE_US = 0), all 9 real contacts that the 2% bar alone under-bounded
had **no** straddling wheel at 1.5 ms. So the rule is: drop the floor only
where at least one wheel straddled at 1.5 ms and the vote did not favour
1.5 ms. On the design sets that covered all 641 builds and bounded 92 of 192
instant builds at 1.5 ms, against 89 with the floor.

## Held out

We committed the rule and its pass/fail test before capturing anything new:
four fresh standard drill sets and 64 fresh instant-only seeds, 324 builds.
The shipped advice told 279 of them TAKE_US = 0.

| bound rule | true contact within the bound | instant builds bounded at 1.5 ms |
| --- | --- | --- |
| floor everywhere (before) | 279 of 279 | 83 of 204 |
| floor dropped where a wheel straddled and did not vote for 1.5 ms | 279 of 279 | 85 of 204 |

Every clause held, so `host.TAKE_BOUND_STRADDLE` is now on. A rule that let
the vote override the fit outright bounded 88, but it under-bounded two
1.6 ms contacts, as it had on the design sets. It stays off.

## The honest size

That is two builds in 204. The floor was never the main reason instant
builds get a loose bound. For 119 of the 204, the 1.5 ms fit sits within
2% of instant whatever the floor, and 109 of the 204 had no wheel
straddling at 1.5 ms at all. With one tach pulse a revolution, a 22-ball
drill has few balls whose contact crosses an edge. A tighter bound for
those needs more straddling balls, not a cleverer reading of the same
frame. All of this is simulated. The method, data and numbers are in
`ventures/open-tennis-robots/eval/take-bound-vote-2026-11-19.md`.
