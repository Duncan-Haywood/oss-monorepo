---
title: "The walk that never arrived: half a call-out check spent searching for a roster another stage finds in 20 ms"
seo_title: "Schedule optimizer speed-up: column generation before local search"
date: 2026-11-13
tags: [ventures, shift-roster-builder, scheduling, optimization, performance]
description: "The rota builder's call-out check now runs 2.3x faster: 570 rebuilds with the same open hours, and retail's wait drops from 10 s to 1.5 s."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) has a setting called "Post the one a call-out hurts least". Several rosters often tie at the best score. To pick between them, the builder pretends each person calls out on each day they work, rebuilds the week around that, and counts the hours left uncovered. That means one full rebuild of the week for every person-day, and on a small café that took 21 seconds. A person waiting at the page will not sit through that.

The last change put the time in those rebuilds, not in building the tied rosters. So this time I profiled the 23 rebuilds for one café roster, stage by stage.

**Half the time went to a search that came back empty.** On 6 of the 23 call-outs, the builder's first passes (simulated annealing, then ejection chains) stopped at 19 or 20 open hours, when 15 is the least possible. Next comes a coverage "plateau walk" that only counts open hours. It has twelve runs of 512,000 steps each, and it stops early once it reaches the proven floor. On these six cases none of the twelve runs found the 15. Getting there means moving people the call-out never touched, and a random walk rarely makes that many moves in a row. The two exact stages that follow, a small branch-and-bound repair and a whole-week column generation (an LP that prices each person's best set of shifts), found the 15-hour roster in 10 to 50 ms and proved it best. The walk had already spent about half a second on each case.

**The fix was already in the code, for big weeks.** On weeks of 60 or more shift copies, column generation already runs before the walk, and the walk runs only if column generation can't prove the roster. The call-out check now asks for that order on every rebuild.

**Checked case by case, not assumed.** The call-out check reads one number from each rebuild: the open hours. On five test teams with six search seeds each, I rebuilt all 570 call-out cases both ways ([`eval/callout-rebuild-order.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/eval/callout-rebuild-order.mjs)):

| team | old order | column generation first |
|---|---|---|
| café | 21.6 s | 9.9 s |
| café with a spare part-timer | 29.5 s | 12.0 s |
| salon | 4.6 s | 4.6 s |
| retail | 11.1 s | 2.2 s |
| clinic | 4.2 s | 2.8 s |
| all 570 cases | 70.9 s | 31.5 s |

In 0 of 570 cases did the open hours differ. In 33 cases the rebuild ended on a different roster with exactly the same score. That doesn't matter here, because the check never posts those rosters. The full pick (six builds plus the pruned check) posts the same roster with the same exposure on all five teams, and it got faster: retail went from 10.0 s to 1.5 s, the spare-part-timer café from 5.9 s to 2.8 s, the café from 21.0 s to 14.4 s.

**What I didn't change.** Fresh builds and reissues of a posted week still use the old order. Those post the roster the manager sees, and the 33 same-score differences would show up as a different posted week. That needs its own check before it ships. The equivalence above is measured on five teams, not proven: on a week where column generation proves nothing, the walk still runs after it, so such a rebuild is now slightly slower than before.

The lesson I'd keep: when one stage stops at a proven floor and another stage can prove that floor, run the prover first. The method and every number are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md), section "Call-out rebuilds, column generation first".
