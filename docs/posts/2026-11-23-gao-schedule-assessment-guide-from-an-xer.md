---
title: "The GAO schedule guide's ten best practices, scored from a P6 file"
seo_title: "GAO Schedule Assessment Guide scorecard from a P6 XER, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, gao]
description: "XER Schedule Check now scores a P6 schedule against the ten GAO-16-89G best practices, every test with its threshold and the activities behind it."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads Primavera P6
`.xer` exports in the browser. Until today it spoke DCMA: the fourteen
screening points the Defense Contract Management Agency published. US federal
programmes are also read against a second standard, the GAO Schedule
Assessment Guide (GAO-16-89G). It sets out ten best practices under four
characteristics: a reliable schedule is comprehensive, well-constructed,
credible and controlled. Agencies, and the contractors who answer to them,
prepare for that review, and paid analytics products sell a GAO metric library
per seat.

The page now has a **Score against the GAO guide** button.

## What changes compared with DCMA

The DCMA points are numeric checks on the network. The GAO guide asks broader
questions, and several of them can be answered from the file with tests the
14 points do not have:

- **Capturing all activities:** is every open activity filed under a WBS
  element rather than the project node, does each name stand on its own, is
  there a finish milestone?
- **Assigning resources:** beyond "has an assignment", does every resource on
  open work have a maximum units per time, so the schedule can be levelled?
- **Durations:** unstarted zero-duration tasks that should be milestones, and
  tasks under half a working day.
- **Traceability:** milestones that nothing drives, on top of the critical
  path test, open finishes and stored dates that no longer follow the logic.
- **A valid critical path:** a driving path of real work from the data date,
  no date constraint or lag on it, and P6's own longest-path flags agreeing
  with the logic.
- **The baseline:** with the baseline project's XER opened alongside,
  activities are traced to it by ID, and missed tasks and BEI are counted
  against its dates. Without it, P6's planned dates stand in, and P6 moves
  those for work not yet started.

Where a DCMA point measures the same thing (logic, leads, lags, constraints,
float), it feeds the practice it belongs to.

## How a practice gets its rating

GAO's auditors rate each practice on five levels, from not met to fully met,
by weighing evidence, and the guide gives practices rather than numeric
limits. A file cannot stand in for that judgment, so the scorecard uses one
rule it states on the page: all tests pass is fully met, three quarters is
substantially, half is partially, any is minimally, none is not met. A
characteristic is the rounded average of its practices, the roll-up GAO's
reports use. Every test shows its threshold and the activities that fail it,
so a reviewer who disagrees with a threshold can see exactly what moves.

There is no single overall grade. An average across four characteristics let
the 42-activity sample file read "fully met" with no resources at all, so the
headline is how many characteristics are at least substantially met, and which
is weakest.

Practice 8, a schedule risk analysis, is evidence outside the file. It is
rated only when the file carries three-point duration ranges in activity
user-defined fields; otherwise it is marked not assessed and left out of the
average.

## How it was checked

On the six public P6 files the tool is tested against, one fault of each new
kind was planted at random (an activity moved onto the project node, a
duplicated name, a zero-duration task, a milestone cut loose, a lag or a
start-on constraint on the driving path). The scorecard named the planted
activity under its own test **129 times out of 129**. The first run found two
bugs before that number was true: failure lists were capped at 200 rows, so on
a file with 1,377 repeated names a planted one could fall off the list (and the
CSV); and files with no stored dates were marked as failing traceability
rather than untested. Both are fixed.

None of the six public schedules is reliable by the headline. The
16,000-activity hospital update is the weakest; the 42-activity sample file
is fully well-constructed and has no resources at all.

## Limits

A rating here is not an audit opinion. Nothing compares these ratings with a
real GAO assessment, because GAO's reviews weigh evidence the file does not
hold and their schedules are not public. That comparison is the next check.

[Open the tool](https://marisstella.app/xer-schedule-check/#gao), or read the
[guide to the GAO assessment](https://marisstella.app/xer-schedule-check/how-to-assess-a-schedule-against-the-gao-schedule-assessment-guide.html).
The file never leaves your browser. MIT licensed.
