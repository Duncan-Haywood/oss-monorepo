---
title: "A school timetable from a plain list of lessons, checked by a second program"
seo_title: "Free school timetable generator: how it works and what it guarantees"
date: 2026-11-16
tags: [school-timetable-builder, optimisation, simulated-annealing, education]
description: "A new browser tool builds clash-free school timetables from one line per lesson. 21 of 21 fully booked test schools, up to 40 classes, solved in under 2.5 s."
---

Small schools still build timetables in spreadsheets. Moving one lesson to
fix a clash creates two more, and the mistake shows up on the first Monday
when two teachers walk into the same lab. The paid suites (aSc TimeTables,
Untis) solve this well, and FET does it for free on the desktop. There was no
tool in this repository for it, and no install-free one that a deputy head
could start in ten minutes, so this run built one:
[School Timetable Builder](https://marisstella.app/school-timetable-builder/).

**The input is one line per lesson.** `7A: Science / Patel / 4 / 2 doubles / lab`
means two double periods with Patel in any lab. `7A+7B: PE / Garcia / 2 / double / gym`
is a joint lesson. `teacher Lindqvist: off Fri` and `max 5 per day` are rules.

**It counts before it searches.** If a teacher has more lessons than free
periods, no search can help, so the page says so with the numbers first. It
also catches a quieter case: in the sample school, Lindqvist teaches 7A
English five times a week but is off on Fridays, so English must fall twice
on one day. The finished timetable has exactly one repeated subject, and it is
that one.

**The solver is a greedy start plus simulated annealing.** Hardest lessons
(doubles, lab and gym lessons, joint classes, busy teachers) are placed first,
each at its cheapest slot. Then two moves run a few hundred thousand times:
move one lesson to another slot, or swap two lessons of the same class. A
clash costs 1,000; a class gap 10, the same subject twice in a day 20, a
teacher gap 3. The scores are updated per class-day and teacher-day, so a move
costs microseconds.

**A second program checks the answer.** "No hard problems" on the page comes
from a validator that rebuilds the week from the finished placements alone,
sharing no state with the solver. If the solver ever reports a clean
timetable that is not, the validator says so.

**How far it goes.** On synthetic secondary schools where every class is
fully booked, 30 lessons in 30 periods with doubles, labs, gyms and teachers'
days off, it solved 21 of 21 instances from 4 to 40 classes with no clash, in
0.2 to 2.3 seconds on one 2.1 GHz core
([benchmark](../../ventures/school-timetable-builder/eval/benchmark-2026-11-16.md)).
Those schools are generated, not real; real timetables carry option blocks and
split sites this does not model yet.

Next: lock a lesson to a slot and edit by clicking, then score against the
ITC 2011 high-school timetabling archive, so the benchmark is not only our own.
