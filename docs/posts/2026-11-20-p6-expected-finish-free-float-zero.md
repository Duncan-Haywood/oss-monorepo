---
title: "Nine free floats P6 said were zero, and the one field they shared"
seo_title: "P6 free float is zero on activities with an expected finish"
date: 2026-11-20
tags: [xer-schedule-check, ventures]
description: "Our free XER checker now matches P6's stored free float on 19,820 of 19,822 activities. The last nine all had an expected finish date set."
---

The free [XER Schedule Check](https://marisstella.app/xer-schedule-check/)
recomputes a Primavera P6 schedule from its logic and compares the result with
the dates and float P6 stored in the file. On six public XER files (P6 5.0 to
24.12, 19,822 open activities) it already agreed on early finish, late finish
and total float for all but 2. Free float, the slack an activity has before it
delays anything else, was behind: 19,810.

Nine of the misses sat in one file, a P6 24.12 Web export. In each one, the
file's own dates left a clear gap before every successor. Activity A10590
finishes on 11 November at 16:12. Its only successor starts on 20 November at
08:00, in P6's stored dates and ours. That is 48.8 working hours of free float.
P6 stored 0.

Yesterday's note on this put it down as unexplained and left it alone rather
than fit a rule to it. Today we looked at every field on the nine. They have
nothing obvious in common: five are started and four are not, their links are
finish-to-start, start-to-start and finish-to-finish, one has no successor at
all, and none was edited after P6's last schedule run. What they do share is
an **expected finish date**. The project has P6's "use expected end dates"
option on, and a scheduler typed a date on each of them.

The split is clean on that file:

| Open activities in the 24.12 file | Count | P6 stores |
|---|---|---|
| expected finish set | 23 | 0, on all 23 |
| ... and a positive gap in the dates | 9 | 0, on all 9 |
| no expected finish, positive gap | 72 | the gap, on all 72 |

So the engine now gives free float 0 to any open activity with an expected
finish when the project uses them. Free float matches P6 on 404 of 404 in that
file and 19,820 of 19,822 overall. The two still off are activities whose
early dates already differ, behind a lag someone lengthened after P6's last run.

We have a reading of why: an expected finish tells P6 the activity ends on
that date, and P6 sizes the remaining duration to hit it, so it shows no room
to slip. But we didn't find this in Oracle's documentation, and it comes from
one file and one P6 version. Of the other five files, none stores an expected
finish. If you have an XER from P6 8 to 23 with expected finishes, it would
show whether older versions do the same.

Why it matters: free float is the number a reviewer uses to see what an
activity can slip without touching its neighbours. If a checker gives 48 hours
where P6 gives none, the reviewer gets two answers and has to work out which
one is right. The schedule CSV download now gives P6's answer.

Method and every count:
[`eval/free-float-expected-2026-11-20.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/xer-schedule-check/eval/free-float-expected-2026-11-20.md).
The tool runs in the browser and nothing is uploaded. Its results are screening
aids, not professional scheduling advice.
