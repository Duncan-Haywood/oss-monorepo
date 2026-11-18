---
title: "Two seconds for the repair: a pre-registered test turns a hunch into a default"
seo_title: "Shift scheduling search: a pre-registered test of a time reserve"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "On 350-400 shift weeks, giving Shift Roster Builder's exact repair 2 s of the budget covered more hours on 22 of 32 fresh builds that differed."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) fills a week's
shifts in stages under a 20-second budget. Fast random walks do most of the
work, and an exact "repair" comes last: it frees three people's shifts and
searches every way to re-assign them along with the open ones. On the biggest
weeks (80-100 people, 350-400 shift copies) the walks use almost the whole
budget, so the repair gets about 0.2 s.

Earlier today a test on 30-60 person weeks found a time reserve for the repair
had nothing to do there: every build already reached its proven floor. The
question left was the big weeks, where a 2 s reserve had been ahead on 7 builds
and behind on 3 out of 24. That isn't enough to change a default.

## More seeds, then a noise check

Six more search seeds on the same eight weeks (48 builds) came out the same way:
10 builds better, 5 worse, 11 more hours covered. Pooled with the first 24, that
made 17 better and 8 worse, p = 0.11. Still a hunch.

These builds stop on a clock, so a reasonable worry is that the reserve's wins
and losses are just timing jitter. So I ran the no-reserve configuration a
second time on the 24 builds that end above their floor. The two runs tied on
22 of 24. The builds are close to deterministic, which means the reserve's
differences come from the reserve.

## Then a test written down first

Before the next run I committed the rule in
[`eval/repair-reserve-big-prereg.md`](../../ventures/shift-roster-builder/eval/repair-reserve-big-prereg.md):
on twelve fresh seeds (13-24) and the four weeks that end above their floors,
turn the reserve on only if it wins on more builds, with a one-sided sign test
p < 0.05 and a net gain in hours covered.

| 48 fresh builds | open hours above the floors | builds at the floor |
|---|---|---|
| no reserve | 305 | 5 |
| 2 s reserve | 271 | 11 |

Fewer open hours on 22 builds and more on 10, one-sided p = 0.025. The rule was
met, so the default changed: under a time budget, weeks with 300 or more shift
copies now give the repair a tenth of the budget, at most 2 s. Smaller weeks get
no reserve, since they already reach their floor. Build time didn't grow.

## What it doesn't show

These are generated weeks, single runs on one cloud machine. The 2 s size and
the 300-copy line were tested, not tuned. The reserve still loses on about one
differing build in three. A 34-hour gain across 48 builds is about 0.7 hours a
week, so it matters most to a manager with a very large roster. The numbers and
scripts are in the venture's README, under "The repair reserve on the biggest
weeks".
