---
title: "Check a P6 submittal against your contract's scheduling section, rule by rule"
seo_title: "Check a P6 schedule against the contract specification, free"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, specifications]
description: "XER Schedule Check now takes the limits from your contract's scheduling section and says met or not met for each, with every activity behind a miss."
---

Every construction contract with a CPM schedule has a section that says what
the schedule must look like. On building work it is often CSI 01 32 16; on US
federal work UFGS 01 32 01.00 10; on highways, a progress-schedule article in
the state DOT's standard specifications. The requirements are concrete: no
construction activity longer than so many working days, no lag longer than so
many, no leads, only certain date constraints, a responsibility and an area
code on every activity, the schedule cost-loaded to the contract value, the
contract milestones shown, retained logic.

The owner's reviewer checks every baseline and every monthly update against
that list before accepting it. With P6 that means one filtered layout per
requirement. Without P6 (owners, lenders and construction managers often
have only the XER) it means reading a PDF by eye.

[XER Schedule Check](../../ventures/xer-schedule-check/) now does the list in
one pass. There is a new section on the page, **Contract specification
check**: open **Rules from your contract**, type the limits your contract
sets, and press **Check against the specification**. Each requirement comes
back met or not met, with what the file shows and every activity or
relationship behind a miss. **Save rules (JSON)** keeps the rules for next
month's update; the CSV goes into review comments. From the command line,
`node cli.mjs update.xer --spec rules.json` exits 1 when a rule is not met, so
a folder of updates can be screened in a script.

## No rules built in, on purpose

It would be easy to ship presets called "USACE" or "Caltrans". It would also
be wrong: specifications are revised, agencies edit them per contract, and a
preset that is out of date would tell a reviewer a submittal passes when it
does not. So every rule is blank until you type it, and a blank rule is not
checked. The page says so, and the guide says what the tool cannot know:
exceptions written into the section (procurement, owner activities), and the
fact that met is not the same as accepted.

## What it found on public files

With one invented rule set (20-day durations, 10-day lags, no leads, cost
loading), on six public P6 files: the public hotel schedule had 277 open
activities over 20 working days. The longest are 330-day design submission
and approval rows, which most specifications would exempt or ask to split. It
also had 547 lags over 10 days and 2,861 activities with no budgeted cost. The
16,146-activity CCA programme took about half a second.

Those files were never submitted against those rules, so this is a picture of
the output, not a grade.

## How it was checked

A separate script (`eval/spec-check.mjs`) recounts each rule's failures
straight from the raw XER tables, without the scheduling model the tool uses,
and compares the counts. On the six files, all **64 of 64** counts agree.
Sixteen unit tests pin the edges of each rule, for example: working days on
the activity's own calendar, exempt words, an expense counting as budgeted
cost, and a milestone name that matches an ordinary activity.

What it has not met yet is a real contract and a real reviewer. If you review
schedule submittals and try it on one, the
[feedback page](https://marisstella.app/feedback/) is the way to say what it missed.
The method, numbers and limits are in
[the guide](../../ventures/xer-schedule-check/how-to-check-a-p6-schedule-against-the-contract-specification.html)
and `ventures/xer-schedule-check/eval/spec-check-2026-11-24.md`.
