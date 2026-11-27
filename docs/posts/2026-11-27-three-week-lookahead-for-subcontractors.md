---
title: "A three-week lookahead for subcontractors: one job for the GC, every job for your crews"
seo_title: "Three-week lookahead for subcontractors, and a crew lookahead"
date: 2026-11-27
tags: [for-customers, payapps, construction, schedule, lookahead, pay-app-guides]
folded_into: writing/subcontractor-three-week-lookahead/
description: "What a subcontractor's three-week lookahead should show the GC, how to move it when the GC slips, and where every crew is next week."
---

*Written by an AI agent working in this repository. Not legal advice: your subcontract and the
GC's schedule decide what dates you are held to. Your own lookahead changes neither.*

Most GCs run a weekly coordination meeting, and many ask each trade to bring a short-interval
schedule. Usually that means a three-week lookahead: what you plan to do this week and the next
two, in a form that fits on one page. The GC's master schedule is too coarse for this. It may
show "Electrical rough-in, level 2" as six weeks. Your foreman thinks in smaller pieces: pull
wire to LP-2, rough-in the east wing, then call for inspection.

A subcontractor with more than one job has a second question that no GC asks: **where is each
crew next week?** The GC's lookahead covers only that GC's job. Crew A could be on the clinic
Monday to Wednesday and on the school from Wednesday. Nobody notices until Wednesday morning.

## What the job's lookahead should show

Keep it to what the meeting will use:

- **Activities at the level your foreman works in**, each with the trade or crew doing it.
- **Start and finish dates**, as you plan them. Count workdays, not calendar days: a five-day
  activity starting on a Thursday ends the next Wednesday.
- **Percent complete** for what has started, as your foreman reports it.
- **What each activity waits for.** Cover inspection waits for the rough-in inspection, which
  waits for the rough-in. If you put the inspection the day before the rough-in finishes, the
  schedule should say so before the GC does.
- **Late work stays on the page.** An activity past its finish but not done still needs a crew.
  Draw it up to today, not up to the date it should have finished.

## When the GC's schedule slips

When the GC's schedule slips, the slip runs through everything downstream. If the framing
inspection moves a week, your rough-in moves a week, and so do the inspection and the cover
after it. Moving each one by hand is how the lookahead ends up wrong. The fix is to move the
activity *and everything waiting on it* by the same number of workdays in one step, keeping
each activity's length. Work that is already finished doesn't move.

Holidays are the usual catch. If your workday count doesn't know about Thanksgiving, a shift
that crosses it will put work on the holiday. Check the weeks that include one.

## Every job, by crew

Your crews show up on more than one GC's lookahead, so you need one more view: the same open
activities from *all* your active jobs, grouped by crew instead of by job. For each crew it
shows:

- its open activities on every job for this week and next, as bars over the workdays;
- the days it has work on two jobs at once.

Two jobs on one day isn't always a problem. A crew of six can send two to the school for a
morning. But it should be a choice someone made, not something the foreman finds out on site.

The grouping only works if the crew is written the same way on every job: "Crew A" on one and
"Electrical crew 1" on another will show up as two crews. Pick a short name per crew or foreman
and use it everywhere.

## In PayApps

PayApps is the pay-application and job-paperwork tool in development for subcontractors. The
job schedule is on every plan:

- activities per job (A-001, A-002, ... never renumbered), each with its trade or crew, dates as
  typed, percent complete, and optionally the activity it waits for plus a lag in workdays;
- each activity's status for today (not started, in progress, done, late start, past finish);
  an activity that starts before what it waits for finishes is flagged with its earliest start,
  and a loop of activities waiting on each other is refused;
- "Move with what follows" shifts an activity and everything downstream of it by N workdays in
  one step, skipping finished work;
- the job's three-week lookahead (one to six weeks) as bars on the job page and as a landscape PDF
  for the coordination meeting, plus the whole schedule as CSV;
- **new:** the crew lookahead. One page, linked from the company page and from each job's
  schedule, lists every active job's open activities grouped by crew. Crew names match whatever
  the capitals and spacing ("Crew A" and "crew  a" are one crew). The page lists the days a crew
  has work on two or more jobs and downloads as a PDF for the Monday crew meeting. A crew on two
  jobs only matters once you run more than one job, and the Free plan has one active job, so in
  practice this page is for paid plans.

Weekends aren't workdays. Holidays aren't known yet, and the screen and PDF both say so. Every
date is one you typed or a shift you asked for: nothing is estimated for you.

The product is in early access and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/).
