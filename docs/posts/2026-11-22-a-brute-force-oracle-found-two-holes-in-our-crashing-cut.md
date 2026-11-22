---
title: "A brute-force oracle found two holes in our schedule crashing cut"
seo_title: "Testing P6 schedule crashing by brute force with SS, FF and SF links"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, algorithms, testing]
description: "Scoring XER Schedule Check's min-cut crashing against every whole-day combination on 5,000 networks with all four P6 link types found two faults, now fixed."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) can answer a
question that comes up whenever a project runs late: which activities do we
shorten together to bring the finish in, and what does each day cost? It
answers it as a minimum cut. The tool takes the network of activities that
drive the finish and finds the cheapest set that every driving chain passes
through. It shortens that set, reschedules, and repeats.

Until this morning that answer had only been checked on finish-to-start
networks. Real P6 schedules also use start-to-start (SS), finish-to-finish
(FF) and start-to-finish (SF) links, often with lags. Those links make the
problem stranger. If an activity's finish is held by an FF link, shortening it
does not bring its finish in. It moves its start later. Anything tied to that
start by an SS link then moves later too, so the project finish can slip.
Schedulers call this reverse drag.

## The check

We wrote a second oracle, sharing no code with the scheduling engine. It
builds random networks with all four link types, whole-day lags and some
leads. For every combination of whole-day shortenings it computes the finish
with its own forward pass. That gives the least cost of every possible gain.
For each step the tool takes, its cumulative cost is compared with that
least cost.

## What it found

In 268 of 5,000 networks the tool stopped short of what was possible or paid
more than it needed to (up to 2.5 times the optimum). There were two causes.
Both were missing edges in the graph the cut is computed on.

1. **A start held twice.** Activity B is tied FF+2 to A, and B's start
   (finish minus duration) lands exactly on the data date. Shortening A alone
   does nothing, because B still starts on the data date and still runs six
   days. You have to shorten both. The graph knew B's start was pulled back
   from its finish but not that the data date held it as well.
2. **A start driven by one link, a finish by another.** When an FS link drove
   an activity's start, the graph skipped the edge that says its SF-driven
   finish pulls the start back. So the cut stopped one activity too early.

After the fix, all 12,791 step points across the 5,000 networks cost exactly
the least their gain can cost, and every run reaches the most the oracle can
win. The earlier checks are unchanged: 5,318 finish-to-start step points and
3,000 bridge networks. The six public P6 files give identical results,
because their driving chains into the finish run through FS links, where
neither hole could open.

## What this does and does not show

It is a measurement on small random networks on one calendar, not a proof.
Mixed calendars, progress and fractional shortenings are outside it. The
numbers, the two cases and the commands to rerun them are in
[the evaluation note](../../ventures/xer-schedule-check/eval/crash-oracle-links-2026-11-22.md).

The lesson we keep relearning is that a test which only runs the shapes you
thought of passes. Brute force on small inputs runs the shapes you didn't
think of.
