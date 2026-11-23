---
title: "The 'but for' date: a collapsed as-built delay analysis from a finished P6 file"
seo_title: "Collapsed as-built delay analysis from a P6 XER, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, delay-claims]
description: "XER Schedule Check now builds an as-built CPM model from a finished P6 schedule, takes the listed delays out and reports the but-for finish by party."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) already runs a time
impact analysis: write the delay as a fragnet, add it to the update in force
before it happened, see how far the finish moves. That is the forward-looking
method. Once a job is finished, the argument usually turns to a different
question: when would it have finished if this delay had not happened? The
method for that is the collapsed as-built (AACE International RP 29R-03,
MIP 3.8 and 3.9), and claims consultants build its model by hand.

The page now has a **Collapsed as-built** section. Open the final update,
list the delays, and it:

1. builds a CPM model that lands every activity on its actual dates (actual
   durations, the file's logic, and the time each activity waited after its
   logic allowed it to start, kept on its links as an *as-built gap*);
2. checks that the model really does reproduce the as-built dates, and says
   how many it lands;
3. takes the delays out (whole activities, some days of one, or the wait
   before one) and recomputes: the finish with everything out, with each
   party's delays out, and with each event's out.

With no list, it shows the gaps. That is where an unrecorded delay usually
sits: a permit, an approval, a crew that was somewhere else.

## The example

On the tool's invented office fit-out, the model lands 22 of 22 activities on
their dates. The in-wall inspection waited 9 working days after the rough-in
for the date the city gave it (owner's side); level 2 demolition ran 5 days
slow (contractor's side). With the owner's wait taken out, the finish comes in
9 days. With the contractor's slow demolition taken out, it does not move:
the inspection date was fixed, so the work before it had room to be late. A
fixed date in the file is kept as a date in the model for that reason. Before
that rule, taking out an upstream slip slid the inspection earlier than the
city would have allowed, and the answer was wrong.

## How it was checked

No public job publishes its as-built schedule with the delays named, so the
check plants them. Six public P6 files were finished "as planned" by the
tool's own statusing code, once with planted slips (1 to 3 activities in
progress part-way through, 1 to 30 working days each) and once without. The
"but for" date is then known: it is the finish of the run without them.

The first run on five of the files got 26 of 30. Each miss pointed at a rule
the model needed:

- **Calendars.** On the Expressway file, a successor works Sunday to
  Thursday and its predecessor works Saturdays. The Saturday counted as two
  days' wait, which it was not: the successor could not have started then
  anyway. The gap is now the smallest lag that still lands the start where it
  was.
- **Finish-to-finish links.** On the hotel file, pairs of activities are tied
  start-to-start and finish-to-finish, each with a 60-day lag. A slip in the
  first stretched the second's actual duration, so the delay was baked into
  an activity nobody listed. An activity whose finish a finish-to-finish link
  held now keeps its planned duration, and the link holds the finish.
- **As late as possible.** The hotel file also has 20 activities set as late
  as possible. They are slid up against their successors, so the link out of
  one always looks tight, though P6 schedules the successor from the
  activity's early dates. The model now works those early dates out and reads
  the gaps from them.

After those fixes the model lands every activity on its as-built dates on
every file, and taking out exactly what was planted gives back the finish
without it on every planted case, slips and waits alike. The numbers per
file are in the venture's `eval/collapse-check-2026-11-23.md`.

## What it does not do

It measures; it does not decide who is responsible. You say which party each
row belongs to. It also inherits the method's known weakness: a gap is
assumed to follow its predecessors, so a wait that was really for a fixed date
needs that date in the file as a constraint. A collapsed as-built and a time
impact analysis of the same delay can disagree, and when they do, the reason
is usually worth knowing. A guide walks through it:
[How to run a collapsed as-built delay analysis](../../ventures/xer-schedule-check/how-to-run-a-collapsed-as-built-delay-analysis.html).

Everything runs in the browser; the schedule is never uploaded.
