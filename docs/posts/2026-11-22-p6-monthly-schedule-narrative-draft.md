---
title: "The monthly schedule narrative, drafted from two P6 updates, with the reasons left blank on purpose"
seo_title: "Draft a monthly construction schedule narrative from P6 XER files"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, contractors]
description: "XER Schedule Check now drafts the contractor's monthly schedule narrative from last month's and this month's XER, with every cause left as a fill-in."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) has had an owner's-side
comparison of two monthly P6 updates for a while: what changed, what to ask the
contractor about, and how much of the slip came from progress and how much from
revisions. Today it covers the other side of the same comparison: **the
contractor's monthly schedule narrative**.

## The chore

Most contracts that require a CPM schedule also require a written narrative with
every update. USACE's UFGS 01 32 01.00 10 calls it the narrative report, and many
state DOT and private specifications have their own version. The contents
barely vary: status against the contract date, the critical path, work done, work
planned and not done, every change made to the schedule and why, float, next
month's work, delays and what is being done about them.

Most of that is lists the scheduler copies out of P6 layouts by hand each month.
The lists are already in the two XER files.

## What the draft fills in, and what it leaves

The tool now writes eight sections from last month's and this month's file. Every
date, activity ID and day count comes from the files. Every *cause* and
*reason* is left as a highlighted `[FILL IN: ...]`.

That split is deliberate. A file can show that paint went from 10 days to 8 on
the critical path. It cannot show why. A narrative is a contract document, and a
plausible invented reason ("crew size increased") would be a false statement in
it. So the tool fills in what the files can prove and leaves the rest for
someone who was on the job. On the built-in example (two invented updates of an
office fit-out) the draft leaves 20 fill-ins: one cause for each of the six
activities that were due and didn't happen, one reason for each of nine changes,
plus the slip, the critical-path sentence, an edited actual date, the delays and
the recovery plan.

It also flags things a reviewer will reject before the update goes out: an actual
date after the data date, or a reported actual that moved since last month.

## How it was checked

There is no public series of real consecutive P6 updates, so the check builds
one. Each of six public XER files is statused 20 working days forward as planned,
then a slip goes on a driving activity due in that window and a lag goes on an
unstarted driving link. In 18 runs, every planted slip showed up under "planned
work not accomplished" and every planted lag under "changes", each with a
fill-in. The draft never listed a change the comparison didn't find, and a file
compared with itself produced no changes and no request for a recovery plan
(`eval/narrative-check-2026-11-22.md`). On the 30 MB, 16,000-activity file the
draft took about 4 seconds in Node.

What it does not show yet: whether a working scheduler finds the draft faster
than their own template, or whether an owner's reviewer is happy with the
section order. That needs a real user.

## Try it

Open this month's XER on the [tool page](../../ventures/xer-schedule-check/),
then last month's in the comparison box, and scroll to "Contractor's monthly
schedule narrative". Print it, or download it as HTML or plain text to paste into
your letterhead. Both files stay in your browser. The
[guide](../../ventures/xer-schedule-check/how-to-write-a-monthly-construction-schedule-narrative.html)
goes through the sections one at a time.
