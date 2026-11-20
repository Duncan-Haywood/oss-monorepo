---
title: "The two dates P6 hides on every relationship, and the lag edits they give away"
seo_title: "P6 XER aref and arls: what they are and what they reveal"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, forensic-scheduling]
description: "Every P6 XER stores aref and arls on each link. Decoded on 40,476 links: they carry the lag P6 used, so a lag changed after the last run reads back."
---

Open the TASKPRED table of almost any Primavera P6 `.xer` export and each
relationship has two columns after the lag: `aref` and `arls`. No P6 screen
shows them, the format notes we could find don't explain them, and
[XER Schedule Check](../../ventures/xer-schedule-check/) ignored them until
today. We worked them out on seven public P6 files (P6 5.0 to 20.12, plus P6
Web 17.12).

## What they are

On a link between two activities that haven't started:

- **`aref`** is the early start the link gives the successor: the
  predecessor's early finish plus the lag for FS, its early start plus the lag
  for SS, and for FF the early finish plus the lag, less the successor's
  duration.
- **`arls`** is the late date the link gives the predecessor: the successor's
  late start less the lag for FS, its late finish less the lag for FF. For SS
  it is the successor's late start less the lag *and less the predecessor's
  own duration*, which is not what the name suggests.

`arls` matches on **40,476 of 40,476** links on the six files that store it.
`aref` matches on 40,383. It's an hour or a few minutes off on 86 links in the
P6 17.12 file and on 7 FF links in one other file. The P6 24.12 Web export we
have doesn't write either column.

When the predecessor is finished, `arls` comes back from the successor's late
date by only the part of the lag still unspent at the data date. That held on
1,894 of 1,894 such links. Our engine had already adopted the same rule a day
earlier, working only from the late dates P6 keeps for finished activities, so
P6's own link records confirm it independently.

## Why a scheduler should care

P6 writes both dates in the same run as the activity dates. They record the
lag P6 used at that run. If someone changes a lag and exports without
rescheduling, the activity dates and the link dates still point to the old
lag, and the old value can be read straight back.

The check we shipped yesterday could only catch a lag that had been
*lengthened* until it broke the stored dates. A *shortened* lag breaks
nothing, so it was invisible. Now the assessment's "Lags edited after the last
schedule run" list includes changes in both directions, each with the lag P6
used. A link with no relationship dates, in a file where every other link has
them, is listed as added after the run. To test it we planted 1,200 lag edits
(10 days shorter to 20 days longer) and 1,200 added links in copies of the
real files, without rescheduling. All 1,200 edits came back with the old lag
exactly, all 1,200 added links were named, and nothing else was listed.

## Two corrections it forced

[Yesterday's post](2026-11-19-p6-lag-edited-after-scheduling.md) said a 608 h lag in the public CCA programme must have been
edited after P6's last run, because the stored dates leave only 440 h for it.
The link's `arls` says otherwise. It sits 200 h before the successor's late
start, which is 608 h less the 408 h spent before the data date. P6's backward
pass used 608 h. So the 168 h shortfall comes from P6's own forward pass, by a
rule we haven't found yet. The tool now says that on the item.

The last five finished activities whose late dates we couldn't reproduce (a
chain of pile caps behind CFNS103317C0) are closed. P6 stored a late date of
2011-10-26 17:36 on the root, which is an after-hours time on its calendar. On
the same run it wrote an `arls` of 2011-10-10 09:36 on that activity's own
link to the next pile cap, and that is the date our engine gives. No rule can
reproduce a stored date that P6's own link record contradicts.

Method, tables and what wasn't checked:
[`eval/relationship-dates-2026-11-20.md`](../../ventures/xer-schedule-check/eval/relationship-dates-2026-11-20.md).
The tool runs in your browser and doesn't upload the file. It gives screening
metrics on your own schedule, not scheduling, contractual or legal advice.
