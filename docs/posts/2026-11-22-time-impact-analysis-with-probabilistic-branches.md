---
title: "A time impact analysis when the delay can go two ways: probabilistic branches in a P6 fragnet"
seo_title: "Time impact analysis with probabilistic branches, free"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, time-impact-analysis]
description: "XER Schedule Check's fragnet now takes branch groups with probabilities: every outcome is scheduled, giving the expected delay, P50 and P80 of a TIA."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) runs a time impact
analysis (TIA) on a Primavera P6 `.xer` export in the browser: you write the
delay event as a fragnet, the tool inserts it into the update and reschedules
it with the file's own calendars and logic, and it tells you how far the
finish moves. Today the fragnet can say that the event **might go more than
one way**.

## The problem with one path

A change order comes in. The designer redraws the level 2 MEP layout (12
days), and the drawings go back to the engineer. Most of the time they come
back approved in 5 days. Sometimes they come back rejected, and the
resubmittal takes 20.

A normal fragnet has to pick one. Pick the 5-day review and the request
understates the risk; pick the 20-day one and the reviewer says you stacked
the worst case. Paid schedule-risk products handle this with *probabilistic
branches*. The tool's Monte Carlo risk run gained them this morning. The TIA
did not have them until now.

## How to write it

Add three columns to the fragnet, in any order:

```
Activity ID,Name,Duration,Predecessors,Successors,Branch group,Branch,Probability
F100,Owner change notice,0,A1030,,,,
F110,Redesign,12,F100,F120,,,
F120,Re-approve drawings,5,F110,A1100,Review,Pass,70%
F120,Re-approve after resubmittal,20,F110,A1100,Review,Resubmit,30%
A1040,,+25,,,Hardware,Late,40%
```

Rows that share a branch group are alternatives, and exactly one of them
happens. Rows with no group happen every time. The same activity ID (F120
above) can appear on two branches with different durations. A branch whose
probability is blank takes an equal share of what the others leave. If a
group's probabilities add up to less than 100%, the rest goes to "none of
these" (the hardware is on time 60% of the time). If they add up to more
than 100%, the tool refuses the fragnet.

## What comes out

A TIA has no random draws, so there is nothing to sample. The tool lists
every combination of branches (up to 512) and schedules each one exactly the
way it schedules a plain fragnet. On the example office fit-out above:

| Outcome | Probability | Delay (working days) |
|---|---|---|
| Review: Pass; Hardware: on time | 42% | 3 |
| Review: Pass; Hardware: Late | 28% | 9 |
| Review: Resubmit; Hardware: on time | 18% | 18 |
| Review: Resubmit; Hardware: Late | 12% | 18 |

The single most likely path says **3 days**. The expected delay over all four
outcomes is **9.2 days**, with P50 at 9 and P80 at 18. A TIA that only took
the most likely path would ask for about a third of the time the event is
expected to cost.

The last row is worth a second look. When the resubmittal happens, late
hardware adds nothing, because both delays land on the same finish and the
longer one wins. That is concurrency, and the outcome table shows it without
anyone having to argue for it. For each branch the tool also reports the
expected delay if that branch happens. The gap between a group's branches
(12.6 days for the review) is what that one decision is worth to the job.

The finish, milestones and float sections of the exhibit still describe one
run, the most likely branch of each group, and they say so. The branches
section sits above them in the page, the printable exhibit and the CSV.

## How it was checked

`eval/tia-branches-check.mjs` plants two branch groups on each of the six
public P6 files the tool is tested on. One group has two or three review
durations under the same activity ID, sometimes with a rework activity that
only one branch has. The other is a hold that may not happen. Every outcome's
finish was compared with a plain TIA of exactly that outcome's rows, written
out separately. The expectation was compared with the probability-weighted
sum of those plain delays, and a single branch at 100% with the same rows
written without branch columns. The counts are in
[`eval/tia-branches-2026-11-22.md`](../../ventures/xer-schedule-check/eval/tia-branches-2026-11-22.md).

No public job publishes a fragnet with alternatives, so the branches were
planted. The probabilities in a real request are a judgment the contractor
has to defend, and the tool cannot supply them. It models the delay. Who
caused it, and whether time is due, is a question for the contract. This is
not legal, contractual or scheduling advice.
