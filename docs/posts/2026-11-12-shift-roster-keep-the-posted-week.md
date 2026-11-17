---
title: "Someone called out. Rebuild the week, but don't move the people who showed up"
seo_title: "Rebuild a posted staff schedule after a call-out, keep everyone else"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, scheduling]
description: "After a call-out, a rebuild that keeps the posted shifts made half the late changes of a free rebuild: premiums halved, same hours left open."
---

A manager posts the week's schedule. On Tuesday evening someone texts that they can't make Wednesday. The [shift roster builder](https://marisstella.app/shift-roster-builder/) gives two ways to handle it. One finds a person who can take the shift as it stands. The other marks the caller off and builds the week again.

On our sample café the first way rarely works: nearly everyone is close to their weekly hour cap, so nobody can take an extra 8-hour shift outright. The second way finds a cover, but until today it rebuilt the week as if the posted roster had never existed. That caused two problems:

- **It could move shifts that had already happened.** Monday and Tuesday were worked by the time the text came in. A rebuild was still free to give Monday's open to someone else.
- **It had no reason to keep anyone in place.** Two rosters with the same open hours and the same pay looked equally good, even if one moved six other people and the other moved two. Under a predictive-scheduling rule, each of those moves can owe the employee a premium.

## What changed

When you load the roster you posted, the builder now does two things:

1. **Shifts that started before the change stay as posted**, with the same person or still open. They're pinned, not just discouraged.
2. **Each posted shift someone keeps earns one hour of their pay in the search.** That's per shift, not per hour, because a late-change premium is charged per change. The weight is far below the cost of an open hour, so the builder never leaves a shift uncovered to keep someone in place.

The command line does the same with `--changes posted.csv`, and `--keep-posted 0` turns it off.

## Measured

We tried every person who works Wednesday to Sunday. Each one called out for that day, and the change was made at 5pm the evening before. That's 19 call-outs on the sample café and 22 more with a spare part-timer added. Every rebuild held the started shifts. We priced the changes at one hour of pay each inside a two-week window, and the caller's own changes were exempt. Every rebuild was proven best for its score.

| 41 call-outs | hours open | late changes to other people | premium | payroll |
|---|---|---|---|---|
| free rebuild | 431 | 190 | $3,190 | $153,339 |
| keep the posted shifts | 431 | 91 | $1,572 | $153,371 |

Late changes and the premium both fell by half. The same hours stayed open on every call-out, and payroll went up $32 over all 41 weeks. The four Wednesday cases are on the guide page about [changing a posted schedule](https://marisstella.app/shift-roster-builder/schedule-change-after-posting.html). A test re-derives that table from the engine.

## What we don't know yet

The weight counts kept shifts, not changes. Moving someone from 6am to 2pm on the same day is one change to a premium rule, but it loses two kept shifts in the score. Raising the weight twentyfold made three more changes on one café, not fewer. So 91 may not be the least possible, and nothing here proves it is. A change-count model is the next step.

The teams and the premium rule are invented. Whether a rule applies to you, and what it charges, is yours to enter. The tool presets no ordinance. A real posted schedule and a real call-out log would tell us more than another invented week.

Method, tables and tests: the README section "Reissue a posted week without reshuffling it" in [`ventures/shift-roster-builder`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder), and `eval/reissue-posted.mjs`.
