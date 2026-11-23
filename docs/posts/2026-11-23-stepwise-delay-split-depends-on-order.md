---
title: "Two delays, one path: a stepwise split hands the overlap to whichever goes second"
seo_title: "Stepwise time impact analysis from a P6 XER: order matters"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, delay-claims]
description: "XER Schedule Check now inserts delay events one at a time in date order and runs the same steps newest first, so an order-dependent split shows."
---

A delay claim rarely has one event. A typical one has an owner's change, a
late approval and a slow crew, and each party wants to know how many of the
days are whose. The [time impact analysis in XER Schedule
Check](../../ventures/xer-schedule-check/) already ran each event alone. That
answer has a known problem: when two events delay the same path at the same
time, their days alone add up to more than the delay with both in.

The usual answer is to put the events in one at a time, in the order they
happened, and recompute after each. Each step is what that event adds on top
of the ones before it, so the steps add up to the total. The tool now does
that whenever a fragnet names two or more events. The order comes from the
earliest `Not before` date on each event's rows.

## The catch, measured

A stepwise split depends on the order. To see how much, the check planted
two-event fragnets on six public P6 files, with answers worked out from
plain one-activity runs instead of from the stepwise runs themselves
(`eval/tia-steps-check-2026-11-23.md`):

- **Events in series** (one activity, then its only successor, both on the
  driving path): 19 of 19 split exactly as expected, and the same in either
  order. Each day reaches the finish in turn, so there is nothing to argue
  about.
- **Events side by side** (one event makes an activity longer, the other
  adds a parallel activity with the same links): 31 of 31 split exactly as
  expected, and **all 31 split differently by order**. The event that goes
  in second is charged only the days by which it outruns the first. Go
  oldest first and the later event is charged almost nothing. Go newest
  first and the older one is.

On the tool's built-in office fit-out, the owner's change adds 3 working
days and the late hardware approval 6 more, 9 in all. Newest first, the
hardware takes all 9 and the change takes none.

So the page, the CSV and the printable exhibit put the steps in date order
next to the same steps run newest first and each event alone, and they say
when the orders disagree. Then a reader can see that the split rests on a
choice of order, not on the schedule's logic alone. Choosing the order, and
deciding whether time or money is due for the overlap, is for the parties
and their contract.

It runs in the browser on your own XER, and nothing is uploaded. The guide
[How to run a time impact analysis on a P6
schedule](../../ventures/xer-schedule-check/how-to-run-a-time-impact-analysis-on-a-p6-schedule.html)
has the column layout. It has not yet been run on a real claim's dated event
list. If you have one you can share, that is the next check.
