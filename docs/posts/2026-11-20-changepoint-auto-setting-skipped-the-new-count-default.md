---
title: "Our auto setting quietly skipped the new count default. A pre-registered rerun fixed it"
seo_title: "Auto-picking a count alert setting: a pre-registered rerun"
date: 2026-11-20
tags: [changepoint-detection, statistics, ecommerce, alerting]
description: "On 2,200 simulated shops the fixed hint sent 2.04 false alerts per 1,000 checks instead of 4.83 and heard 38 more steps. Never using it was quieter still."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a watch for a shop's daily numbers: run it
every morning on orders or revenue and it sends an alert when the level moves. Earlier today it got a new default for
counts such as orders: a cost that allows for days that come in bunches, and a lower alert bar. That was tuned on one
set of simulated shops and confirmed on a fresh set
([the earlier post](2026-11-20-changepoint-count-watch-new-default.md)).

There was a gap. The watch has a "How eager" hint: it replays your own history under each setting and picks the most
eager one that would have stayed within an alert budget. The setup we suggest for scheduled watches,
`--detector auto --alerts-per 1/month`, uses that hint on the first run and stores the pick. For counts, the hint
still chose between the *old* default and an eager one. So anyone following our own instructions got the old default
whenever their history was quiet. The new one only reached people who named no detector at all.

## The test

Before anything ran, we wrote the rule down and committed it
([pre-registration](../../ventures/changepoint-detector/eval/watch-eagerness-counts.prereg.md)). We simulated eleven kinds
of shop, 200 fresh ones each: steady orders, bunched orders, a weekend dip, small counts, and six kinds of step up or
down. Each series is 240 days long. The hint sees the first 120 days and picks a setting. That setting then watches
the next 120 days, and we score only those. To ship, the fixed hint had to beat today's hint on false alerts (within
1 per 1,000 checks), hear more steps, and lose no single kind of shop by much.

| what picks the setting | false alerts per 1,000 checks | steps heard, of 1,200 |
|---|---|---|
| today's hint (old default or eager) | 4.83 | 1,047 |
| **fixed hint (new default or eager)** | **2.04** | **1,085** |
| no hint, new default always | 0.54 | 1,057 |
| no hint, old default always | 3.20 | 736 |

It passed all four bars: 2.78 fewer false alerts per 1,000 checks (95% interval 2.48 to 3.08), 38 more steps heard
(20 to 56). The biggest change was on very bunched orders, where the old default sent 13 false alerts per 1,000 checks
and the new one about 1.

## The part we did not expect to write

Look at the third row. Never using the hint, and always running the new default, sent a quarter of the hint's false
alerts and heard only 28 fewer steps. On orders that don't bunch, a quiet history leaves the eager setting under budget
almost every time, and the eager setting then sends about one extra false alert per 1,000 checks. We also tried putting
the old default back as a middle step. It did not help. The old default is quieter than the new one on smooth counts and
noisier on bunched ones, so it isn't a step up in eagerness at all.

So the fix ships, and `--suggest` now says plainly that for counts the plain default is a fine place to start. A state
file that already stored the old pick keeps it. Delete its `choice` entry to pick again. Everything here is simulated.
No real shop's orders, with changes the owner can vouch for, have been scored yet. That is the next test worth running.
