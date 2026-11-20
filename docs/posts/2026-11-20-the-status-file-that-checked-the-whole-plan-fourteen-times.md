---
title: "The status file that checked the whole plan fourteen times per write"
seo_title: "Python validation memo: a 16x faster job status write"
date: 2026-11-20
tags: [performance, python, photo-editing, engineering]
description: "ShootFlow re-checked its whole job plan about 14 times per status write. Checking once per plan cut a write from 0.89 s to 57 ms on a 2,000-photo shoot."
---

[ShootFlow](/photo-editing/), our open-source photo and video pipeline, tracks
every job of a shoot (proxy, analysis, grade, render) in one status file. Each
time a job starts or finishes, it loads that file, changes one entry and writes
it back, checking everything along the way: the file comes from disk and is not
trusted.

The checks also covered the production plan, the list of jobs the program
itself built. That plan never changes during a run, but every load, every
replace and every write checked all of it again, and computing its fingerprint
checked it once more. A profiler counted 273 full passes over the plan for 20
status writes, about 14 per write, each one touching every job's inputs and
outputs.

That is invisible in a test with five files. It is not invisible on a real
card. A shoot writes at least two statuses per job, so the total cost grew with
the square of the number of jobs:

| photos | jobs | before, per write | after, per write |
|---:|---:|---:|---:|
| 100 | 305 | 44 ms | 3.3 ms |
| 500 | 1,505 | 232 ms | 13.5 ms |
| 2,000 | 6,005 | 890 ms | 57 ms |

At 2,000 photos that is roughly three hours of bookkeeping before and eleven
minutes after, on one laptop core.

The fix is a small memo: validate a plan once per plan object, keep the result
while that object is alive, and never cache a failure. The plan is an immutable
(frozen) Python dataclass made of tuples, so the same object always validates
the same way. The status file is still checked in full on every load and write.

We checked it the dull way: the old module and the new one, side by side, gave
byte-identical files and identical error messages across 204 cases, including
ten deliberately broken plans.

What's left is linear: each write still rewrites the whole status file. Making
a write constant-time means changing the file format other tools read, so that
is a job for another day. The full reading is in
`docs/history/ci-perf-2026-11-20-production-status-plan-memo.md`.
