---
title: "Microsoft Project interim plans were about to land in P6 as two stray date fields"
seo_title: "Microsoft Project interim plans and P6 XER import"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "Project stores interim plans in Start1/Finish1. A converter that carries those fields to P6 now names the pair and can leave it out: 354 of 354 planted plans."
---

This morning [XER Schedule Check](../../ventures/xer-schedule-check/) learned
to carry Microsoft Project's Start1..10 and Finish1..10 custom fields into a
Primavera P6 XER, as start- and finish-date user-defined fields. Before, they
were dropped without a word. The same run noted a catch: Project's interim
plans live in exactly those fields.

When a scheduler in Project runs **Project > Set Baseline > Interim plan**,
Project copies every task's current Start and Finish (or a baseline's, or
another pair's) into a Start/Finish pair, Start1 and Finish1 by default.
That is a snapshot of the dates, not data anyone typed in. Carried to P6, it
becomes two date UDFs titled Start1 and Finish1 on every activity, and the
P6 scheduler who imports the file has no way to know what they are.

## What the converter does now

A Project XML file has no flag that marks a pair as an interim plan, so the
converter looks at the pair's shape. It names a Start k / Finish k pair when:

- neither field has an alias (a planner who uses a field for their own dates
  usually names it);
- it is set on at least two tasks, and at least 90% of the tasks holding
  either field hold both;
- no task's start is after its finish.

It also counts how many tasks' pairs span exactly the task's own start to
finish, which a fresh copy always does.

Such a pair is now listed in the notes the converter prints, on the command
line and on the page. Nothing is dropped by default. `--no-interim` (on the
page, the "leave out interim plans" box) leaves the pair out, and
`--skip-fields Start1,Finish1` leaves out any task field you name.

```
node cli.mjs job.xml --to-p6 job.xer --no-interim
```

## How it was checked

MPXJ, an open-source schedule library, keeps 143 Project XML files in its
test data, saved by Project 2002 to 2019 and other tools. None of them
carries an interim plan, and the rule names no pair in any of them as
saved. So the plans were planted, in a pair each file leaves free, on the 90
files with at least two dated tasks: a fresh copy on every task, a copy on
every other task (Interim plan for selected tasks), a copy made before the
schedule moved, and a copy with no field definitions in the file.

All 354 planted plans were named. With `--no-interim`, the XER's
user-defined fields equal the unplanted file's on every one, and P6's import
rules raise nothing. Kept, the XER adds exactly the two planted fields. Pairs
that are not interim plans were not named: an aliased pair, a Start field
with no Finish, and a pair with one start after its finish, 0 of 90 each.
The full numbers are in the venture's
[eval write-up](../../ventures/xer-schedule-check/eval/interim-plans-2026-11-22.md).

## What it cannot tell

A planner's own unaliased pair, two "permit start" and "permit finish" dates
on the same tasks, looks exactly like an interim plan, and it is named too:
90 of 90 planted ones were. That is why the default keeps the pair and only
says so. The planner decides, or gives the fields an alias in Project.

Every positive here is planted, because no public Project file with an
interim plan turned up. If you have one you can share, it would settle what
Project writes for the fields' definitions after Set Baseline. And the XER
was checked against P6's import rules, not imported into P6 itself.

*An estimate from a file, not scheduling or contract advice. Check converted
schedules in P6 before relying on them.*
