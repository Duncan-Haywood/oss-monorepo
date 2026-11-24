---
title: "One P6 checkbox took six public schedules from 817 critical activities to 1,445"
seo_title: "P6 make open-ended activities critical: what it changes"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, critical-path]
description: "P6's 'Make open-ended activities critical' option zeroes float behind every activity with no successor. On six public XERs it adds 628 critical activities."
---

Primavera P6 has a schedule option most reviewers never look at: **Make
open-ended activities critical**. With it on, an activity that has no
successor gets its early finish as its late finish. It has no float, and
neither does the chain of work that drives it. Microsoft Project has the same
thing under another name, **Calculate multiple critical paths**.

[XER Schedule Check](../../ventures/xer-schedule-check/) read that setting
from the XER's `SCHEDOPTIONS` table but did not apply it. So for a file saved
with the option on, the checker would have shown float on open ends running
to the project finish, where P6 shows zero. That was listed under "Not
modelled" in the README. As of today the backward pass applies it, the
Project XML reader takes it from `<MultipleCriticalPaths>`, and both
converters (XER to Project XML, Project XML to XER) carry it across.

## How much it matters

None of the six public P6 files the tool is checked against turns the
option on. So the new check (`eval/open-critical.mjs`) turns it on in a copy
of each one and reschedules:

| file | open activities | open ends | critical, off | critical, on |
|---|---:|---:|---:|---:|
| CCA (heavily progressed) | 14,270 | 10 | 544 | 643 |
| Expressway | 823 | 65 | 33 | 262 |
| example_xer_file | 404 | 34 | 0 | 235 |
| hotel | 4,236 | 26 | 197 | 227 |
| sample | 42 | 1 | 42 | 42 |
| airport terminal | 66 | 1 | 1 | 36 |
| **total** | **19,841** | **137** | **817** | **1,445** |

137 open ends are enough to make 628 more activities critical. On the
Expressway file the critical count goes up eightfold. On one file it goes
from none to 235. No early date moved on any of the 19,841 activities, and no
activity gained float. The option only removes float, and only behind open
ends.

## Why a reviewer should care

The critical count in a DCMA or GAO review, "how many activities are
critical", depends on this checkbox as much as on the logic. Two
contractors' schedules with the same network can report very different
critical counts if one of them ticked it. It also hides open ends: once
every dangling activity is critical, the float that would have shown it is
gone, though the checker's "missing successor" finding still names them.

So it is worth knowing which way the flag is set before you compare critical
counts. The checker now gets P6's answer either way. With the flag off,
every date and float is exactly what it was before (still 19,820 of 19,822
open activities equal to P6's stored values).

## What is not checked yet

No public XER has the option on, so the rule is pinned by a planted test and
by P6's documented behaviour, not by a P6 run. If you have a P6 file
scheduled with **Make open-ended activities critical** ticked, it is the one
input that would confirm this on real data.

Details: the venture README, "Make open-ended activities critical", and
`eval/open-critical-2026-11-24.md`.
