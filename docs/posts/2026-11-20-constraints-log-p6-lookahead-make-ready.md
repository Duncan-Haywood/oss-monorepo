---
title: "Merging the site's constraints log with the P6 schedule: which late delivery moves the finish"
seo_title: "Constraints log and make-ready check from a P6 XER"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, last-planner, lookahead]
description: "Paste the materials, permits and RFIs log beside a P6 XER: each row gets its need-by date, a status, and how far it moves the finish if it clears late."
---

Every site meeting has two documents on the table. One is the look-ahead,
cut from the Primavera P6 schedule. The other is the constraints log: a
spreadsheet of the things the schedule doesn't hold. The rebar delivery, the
inspection, the RFI the architect hasn't answered, the crew still on another
job. Last Planner calls an activity "sound" only when both are clear: its
predecessors are done and nothing on the log holds it.

The two rarely meet. The log has its own "need by" column, typed by hand
from whatever the schedule said last month. So nobody can say at the table
which of the twelve late items actually costs the job time.

[XER Schedule Check](/ventures/xer-schedule-check/) now merges them. Open
the XER, build the look-ahead, and paste the log (or open it as a CSV). The
columns are found by name. Only the activity ID is required, and dates can
be typed the way people type them.

## What each row gets

- **Need by**: the activity's remaining early start from the recomputed
  schedule, not last month's guess. For work already under way, it's now.
- **Latest start**: the late start, past which a deadline moves.
- **Status**: overdue (the promised date has passed and the row is still
  open), late (it clears after the need-by day), no date, on track, or
  cleared. Rows against finished work, and IDs not in the file, are named.
- **Days to spare**, in working days on the activity's own calendar.

An activity that is ready by its logic but has an open row is now marked
**constrained**, not ready.

## The what-if

Then the question the meeting actually asks: if everything on the log
arrives when promised, where does the finish land? Each open row's expected
date goes into the CPM engine as a start floor on its activities. The same
engine checks against P6's own dates on 19,820 of 19,822 activities. The
schedule is recomputed, and the page gives the finish with the log next to
the finish without it. Then each late row is run on its own, and the rows
are ranked by how far each one moves the finish. That ranking is the list
of calls to make first.

On the example schedule, three of the five open rows are late. Only the
mechanical crew, promised for 4 May against a 17 April need, moves the
finish, by two working days. The asbestos certificate and the stud delivery are both late too,
but float absorbs them. Ranked, the crew row sits at the top.

## How it was checked

Nobody publishes a real site's constraints log, so we planted them. We took
six public P6 files, up to 40 rows each, and three seeds: 432 rows in all,
224 of them late. Then we computed the answer a second way: we wrote the
same expected dates into the XER as P6 "start on or after" constraints and
scheduled it from scratch.

- The finish matched on 16 of 16 runs, and every open activity's dates
  matched on 59,334 of 59,334.
- Each row's own finish slip matched on 128 of 128.

The first pass of that check did catch a bug. On the hotel file, nine
as-late-as-possible activities came out with different starts, because the
what-if was running only the forward pass, and ALAP early dates come from the
backward pass. That's fixed.

The more interesting finding was about the late-start flag. On the
14,270-activity CCA file, 17 planted rows passed their late start without
moving the project finish. The file carries negative float from interim
date constraints, so those rows break an interim deadline while the end
date holds. A what-if that only reports the finish would call them
harmless, so the page shows both numbers. On the hotel file, two rows
passed the late start without moving anything at all, with no deadline in
sight. We haven't traced that yet, and the
[eval](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/xer-schedule-check/eval/constraints-check-2026-11-20.md)
says so.

The log stays in the browser tab. The updated version, with the schedule's
columns added, downloads as a CSV for next week's meeting. It's free, MIT
licensed, and not professional advice: check the dates against the
scheduling software of record before acting on them.
