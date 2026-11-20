---
title: "The Friday P6's float forgets: hidden float where curing and crew calendars meet"
seo_title: "Hidden float in Primavera P6 across mixed calendars"
date: 2026-11-20
tags: [xer-schedule-check, ventures]
description: "On a public P6 hotel schedule, 188 activities have up to 17 h more float than P6 shows, because an FF lag on a 7-day curing calendar ends on a Friday off."
---

Our free [XER Schedule Check](https://marisstella.app/xer-schedule-check/)
recomputes a Primavera P6 schedule's dates and float from its logic. On six
public XER files its numbers equal the ones P6 stored on 19,820 of 19,822
open activities, so when it disagrees with itself, it is worth a look.

It disagreed with itself earlier today. The constraints log we shipped this morning
asks "if this delivery arrives on the promised date, does the finish move?"
On the public hotel schedule, a planted row pushed "Prepare stores and
workshops" a day past the late start P6 stored, and the finish didn't move.
The file has no negative float and no interim deadlines, so a start past the
late start should cost a day at the end. It didn't.

## Following the push

We pushed the activity one day and walked down the chain that sets its late
dates. Every activity on it started past its own late start, through tower
crane erection and a run of slab pours, until one link:

- **Cure and de-shutter slab formwork**, on a 7-day calendar (curing doesn't
  stop for the weekend), tied by **finish-to-finish, 32 hours** to
- **Erect slab formwork** in the next zone, on the crew's calendar, where
  Friday is the day off.

The lag is counted on the curing activity's 7-day calendar. Pushed a day, it
ends on Friday, the formwork crew's day off. The formwork activity can't
finish on a day it doesn't work, so its finish goes to Saturday 08:00. On the
crew's calendar that is the same moment as Thursday 16:00, and the next
activity starts Saturday morning either way. Nothing downstream moves.

P6's backward pass, which our engine reproduces, doesn't see this. It counts
the 32 hours back from the formwork's late finish, Thursday 16:00, and so
takes the Friday away from the curing activity and from everything that
drives it. P6 isn't wrong by its own rules. It gives the tighter reading,
and a scheduler reading its float is told there's a day less than there is.

## How much float is hidden

We added an option that lets the backward pass count a finish-to-finish or
start-to-finish link back from the latest moment the successor may finish
(up to its next working start, when nothing after it can start sooner), and
ran it on all six files:

| File | Open activities | With more float than P6 shows |
|---|---|---|
| Hotel (P6 6.0) | 4,236 | 188, gaining 1 to 17 h |
| Five others (P6 5.0 to 24.12) | 15,605 | 0 |

The other five files don't join calendars with different working days
through these links, so nothing changes there. On the hotel file the hidden
float sits on 22 links, 21 of them the same curing-to-formwork pattern
repeated zone by zone up the building. 27 of the 188 activities show 8 hours
of float or less in P6. One curing activity goes from 8 h to 17 h, which is
the difference between "near-critical, watch it daily" and "has two days".

We checked each of the 188 the same way we found the first one. We delayed
it by its new float and rescheduled: the finish held on 188 of 188. Then we
delayed it one working hour more: the finish moved or another activity ran
past its late finish on 188 of 188. So the new figure is neither too generous
nor too cautious, by this engine's own forward pass.

The check also turned up the mirror case. A start milestone on the Friday-off
calendar, fed on Thursday evening, sits at Saturday 08:00, and a successor on
a 7-day calendar loses the Friday. There, P6's float is a day too long. That
one is next.

## Using it

Open an XER on the [tool's page](https://marisstella.app/xer-schedule-check/)
and press "Find hidden float" under "Float P6 does not show across
calendars". You get the links where it enters and the activities that gain,
least float first, with a CSV. From the command line it's
`node cli.mjs schedule.xer --calendar-slack`. Everything runs in the browser
and nothing is uploaded. If you'd rather P6 showed the same figure, put the
predecessor and the lag on the successor's calendar, or line the calendars'
working days up.

The method and every number are in
[eval/calendar-slack-2026-11-20.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/xer-schedule-check/eval/calendar-slack-2026-11-20.md).
One public file carries the effect, so this is a pattern we have seen once,
on 22 links. If your schedules mix curing or 24-hour calendars with crew
calendars, we'd like to know what the panel shows.

*Screening on your own file, not scheduling, contractual or legal advice.
Not affiliated with Oracle or Primavera.*
