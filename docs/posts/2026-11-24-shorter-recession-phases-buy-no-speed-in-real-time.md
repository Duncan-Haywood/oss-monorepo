---
title: "A shorter minimum phase called no US turn sooner, and added a recession that lasted 17 years"
seo_title: "Shorter recession phases buy no speed in a real-time replay"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Replayed month by month since 1970, a 3-month phase minimum called each NBER turn in the same month as the 6-month rule and added a phantom 2002-03 recession."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/)'s `--turns --columns`
option changed its default: on a monthly composite, a phase between a peak and a trough now needs
to last only 3 months, not Bry-Boschan's 6. Five simulated business makes (a maker, a shop, a SaaS
company, an agency and a freight carrier) all scored better with it, because short contractions
stop getting merged away.

A few hours before that, we had [replayed the old rule month by month](2026-11-24-replaying-a-recession-dater-month-by-month.md)
on the four monthly indicators NBER's committee watches, cutting the data off at every month from
1970 and asking when each turn was called for good. This post reruns that replay under the new
3-month minimum, with the same bars written down before it ran.

## The result

| | 3-month minimum | 6-month minimum |
|---|---|---|
| NBER turns called (of 16) | 15 | 15 |
| median months from turn to call | 7 | 7 |
| called before NBER announced (of 12) | 7 | 7 |
| false turns shown, then taken back | 6 | 4 |
| a turn with 18+ months of data after it later moved | 6% | 0% |

Every call landed in exactly the same month under both rules. The short phases the new rule
rescues in simulation don't happen at the moment of a call on the real data: by the time five
months of data follow a turn, which is the least the rule needs to date one, the phases on either
side already run six months or more.

What the 3-month rule adds is one pair of turns: a peak in November 2002 and a trough in April
2003, the soft patch after the 2001 recession. NBER never dated it. In the replay it appears in
2003 and then stands at every cut-off for 17 years. It goes away in March 2020, when the pandemic
swings enter the volatility weights that balance the four lines and the 2002 dip shrinks below the
rule's reach. Under the old rule, no turn with a year and a half of data behind it ever moved.
Under the new one, 6% of those readings were this pair.

One pre-registered bar failed (called before NBER in at least 8 of 12), the same one that failed
for the old rule, so nothing new ships. The 3-month default stays: it was chosen on full-sample
accuracy across the simulated makes, and this replay doesn't measure that. What it does say is
that the default's cost on real US data is this one long-lived false contraction, and that the
open problem is the weights rather than the phase rule. With the weights fixed to end-2019, both
rules call all 16 turns and beat NBER on 8 of 12.

Script, output and bars: `ventures/changepoint-detector/eval/turns-realtime-p3.mjs` and the
README section "Turns called in pseudo-real time under P3".
