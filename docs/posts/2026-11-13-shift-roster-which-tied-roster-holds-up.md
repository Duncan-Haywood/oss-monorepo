---
title: "Six equally good schedules, and the one a call-out hurts least"
seo_title: "Choosing a staff schedule that survives call-outs"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement]
description: "Equally good schedules differ by half in what one call-out costs. Picking the least exposed cut open hours 3.5% over 40 seeded weeks, with 16% more changes."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) proves its schedules are the best for the week as given: fewest open hours first, then payroll, fairness and the rest. It cannot see who will call out on Thursday. This morning's [week of call-outs](2026-11-13-shift-roster-a-week-of-call-outs.md) ended on that question. Could a schedule keep some slack for the call-outs still to come?

## Making slack did not work

The obvious first try was to hand a shift to someone else whenever that left a person free behind it, and charge each move as a change. On the sample café it moved nothing. Almost every shift from Tuesday to Sunday had nobody free to take it outright. On a tight team there is no slack to make.

## The slack was already there

The search often finds several schedules with exactly the same score: same payroll, same open hours, same fairness. Searching with six different random seeds gave six different best schedules on the café, retail and clinic templates. Until today the tool posted whichever one it met first.

Those ties are not equally robust. So the tool now plays every possible single call-out against each one. For every person-day worked Tuesday to Sunday, the call-out comes in at 5pm the evening before, shifts that have started stay put, and the rest of the week is rebuilt keeping the posted shifts. It then adds up the open hours each call-out would leave. On the café, the six tied schedules scored 92, 100, 100, 116, 132 and 140 hours. The worst is half as exposed again as the best, at the same score.

## Does the score predict real weeks?

Each tied schedule was then posted and played through the same 40 seeded weeks at one real firm's rates: 1.0% or 8.4% of person-days called out, with or without extra shifts added at 10.9%. Added open hours over each 40-week cell, summed over the café, retail and clinic templates:

| | least exposed | average tie | most exposed |
|---|---|---|---|
| open hours added by the week's events | **3,304** | 3,423 | 3,595 |
| changes to other people | 970 | 837 | 624 |

The least-exposed schedule did better than the average tie in 10 of the 12 cells, tied in 1 and did worse in 1. That one was the café with extra shifts, where the extras swamp the call-outs. At the sick-leave rate on the café the simple forecast held closely: exposure 92 predicted 37 lost hours over 40 weeks and the play lost 32; exposure 140 predicted 56 and lost 56. The salon worked as a control. Its five tied schedules had equal exposure and lost exactly the same hours in every cell.

## The catch

A schedule that leaves people free where call-outs land gets those people called in. So the steadier pick told 16% more people of a late change than an average tie. Fewer open shifts or fewer phone calls is the manager's trade, not the tool's. That is why it is opt-in: `--steady` on the command line, or `steadyRoster` for an agent. Its report also names the call-outs that would still leave hours open.

One more number puts this in proportion. Built with hindsight, knowing every call-out in advance, the café at the 8.4% rate could have lost 109 fewer hours than the posted-week reissue did. Picking the steadiest tie recovers about 28 of them. On the clinic, hindsight could not beat the reissue at all. The rest of that gap needs the search itself to price steadiness against payroll, and that is next.

Every number here comes from invented teams and one firm's call-out rates. Full table and method: the [README section](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#which-of-the-tied-best-rosters-holds-up-to-a-call-out-2026-11-13). Planning aid, not legal advice.
