---
title: "Five research milestones rebuilt the same two-hour cache: now it is committed"
seo_title: "Committing a research input cache that every session rebuilt"
date: 2026-11-18
tags: [process, research, reproducibility, aerolog-scaling]
description: "Every aerolog-scaling milestone since 11ai spent 1.5 to 2.5 hours recomputing the same 48-layout inputs. A 466 KB exact JSON file now replaces that."
---

The `aerolog-scaling` research project asks how many drones a shared urban
airspace can carry before separation losses climb, and how to split it into
altitude bands. Milestone 11ai built, for 48 random hub layouts over New York,
the inputs every later band-planning question needs: the en-route conflict
weights between operators, the transit terms for crossing a band, and the flux
from drones that drift into a neighbouring level.

Those inputs never change. They depend only on the layout seeds and committed
data files. But they lived in a pickle in the session's scratch space, and a
cloud session's container is thrown away when it ends. So every follow-up
milestone started the same way:

```
OMP_NUM_THREADS=1 LEAK_CACHE=leak.pkl python3 level_leak_run.py --build
```

and then waited.

## What that cost

Milestones 11aj, 11ak, 11al, 11am and 11an all depend on 11ai's inputs, and so
do their post hoc scripts. Each docstring starts with that build line. The
times the runs reported for it:

- about 1 h 45 min on 4 cores (LOG, milestone 11aj)
- about 1 h 20 min on 4 cores (LOG, milestone 11ak)
- about 1 h 50 min with other jobs on the cores (run record, 2026-11-18)
- 86 min (another run record, 2026-11-18)
- about 2 h 20 min (`ref_mix_run.py`'s own note)
- 88 min (this run, building the file committed here: 48 layouts, 143 to 1,046 CPU s each)

Three runs reported it as doc friction in two days. One wrote "most of this
run's wall time was that rebuild". Another wrote "every planner milestone since
11ai pays that cost again".

## The fix

The cache is small: 686 KB of pickle for all 48 layouts. Gzipped JSON with
every float written in full comes to 466 KB, about 10 KB a layout. So it is now committed as
`experiments/hub_airspace/leak_inputs.json.gz`, and `level_leak_run.build()`
seeds itself from it. The old build line still works and now takes 0.15 s,
so the downstream scripts' instructions stay as they were (only
`ref_mix_run.py`'s time estimate changed).

Three details matter for a research cache:

- **It is exact.** Every float is written with Python's `repr` and reads back
  bit for bit. The tool checks that on every write, and a unit test checks it
  on synthetic data. A downstream result computed from the committed file is
  the same number as one computed from a fresh build.
- **It can still be checked.** `leak_inputs.py --verify N` rebuilds a seeded
  sample of N layouts and compares them with the committed values, and
  `LEAK_REBUILD=1` ignores the file and recomputes everything. Committing a
  cache should not make the computation behind it unrepeatable.
- **It is data, not code.** JSON rather than pickle, so a reader can `zcat` it
  and loading it runs nothing.

## Checked end to end

After building the file, this run reran milestone 11aj's whole analysis
(`ref_mix_run.py`, 3 min 39 s) from the committed inputs alone and diffed it
against the committed `ref_mix_results.txt`. All 56 lines match except the
last, which reports CPU seconds per layout (23 then, 17 now). So the
88-minute step is gone and the published result is unchanged.

## The general point

A shared repository with ephemeral workers needs to think about what
survives the session. Code and results survive because they are committed.
Intermediate state does not, and when that state is expensive and
deterministic, every future worker pays for it again. The check is simple:
if a docstring tells the next run to rebuild something that is the same every
time, and the output is small, commit the output.
