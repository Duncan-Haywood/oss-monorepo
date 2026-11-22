---
title: "Rework that may never happen: probabilistic branches in a free P6 risk run"
seo_title: "Probabilistic branches for a Primavera P6 schedule risk run, free"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, risk]
description: "XER Schedule Check's Monte Carlo now takes probabilistic branches: one path per group drawn each run, the others' work dropped, checked on six P6 files."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) runs a Monte Carlo
finish-date risk analysis on a Primavera P6 `.xer` export in the browser:
ranges on every open activity, a risk register, P50 and P80 dates. Today it
also takes **probabilistic branches**.

## The problem a risk register cannot express

A risk register says "this work may take longer". Some of the biggest
questions on a job are a different kind: *which* work happens at all.

- The waterproofing inspection passes, or rework and a re-test follow.
- The permit arrives, or the redesign path runs.
- The pile test is good, or the foundation is redesigned.

A scheduler who wants to show the second path has to put its activities in
the P6 file, and once they are in the network the single CPM date counts them
every time. If the rework is a 30% chance, the forecast overstates the
finish 70% of the time, and nothing on the screen says how much the finish
hangs on one outcome. Paid tools (Primavera Risk Analysis, Safran Risk) model
these as branches. Until today this one did not.

## How it works

One line per branch, `group, branch, probability, activity IDs`:

```
Inspection, rework, 30%, A2010, A2020
```

Lines with the same group are the alternatives at one point. In each run one
branch per group is drawn; the activities of the branches not drawn are
dropped from that run (remaining duration 0, logic kept, so work after them
waits only on the rest of its logic). Probabilities can sum to less than 100%:
the remainder is "none of the listed work happens", so the single line above
is a complete branch. If work has already started on one branch, that branch
has been taken and is kept in every run. A risk event on dropped work adds
nothing in that run. And the branches draw from their own random stream, so
adding them leaves every duration draw exactly as it was: the change you see
is the branches, not sampling noise.

The result: each branch's drawn share and its **finish shift**, the mean
finish of the runs that took it minus the rest, marked when it is within the
noise of the run count. It is on the page, in the CLI (`--branches`), in the
JSON, and in the written review's risk section.

On a small test schedule (inspection, 4-day rework and 1-day re-test at 30%,
hand-over), the CPM finish is 7 working days; the P50 is 2 and the P80 is 7,
and the rework branch shifts the finish by exactly its 5 days.

## Checked on real files, and one thing they showed

No public job publishes a branch register, so the check plants branches on
each of six public P6 files' own driving paths and compares every run's
finish with the CPM engine scheduled directly, with the dropped activity at
zero: [113 of 113 checks hold](../../ventures/xer-schedule-check/eval/branches-2026-11-22.md).

The surprise was how often dropping a driving activity changed nothing: in
13 of 24 picks the finish stayed put, because another path or a constraint
drives the same date. A branch on such an activity is worth nothing to the
finish, and the branch table shows a shift of 0.0 where the single critical
path would suggest otherwise.

Not checked yet: a real job's branch register, and the dates a paid risk tool
gives for the same branches on the same file. Results are screening estimates
from your own assumptions, not scheduling, contractual or legal advice.
