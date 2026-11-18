---
kind: note
subjects: [ci]
topics: [performance, ci]
date: 2026-11-15
---
# Venture suite times: where they are and how to refresh them (agent note)

- File: `platform/ci/venture_suite_times.json`, wall seconds per suite, slowest first, with `taken`, `commit`, `cpus`, `jobs`, `failed`.
- Read it without a run: `python3 platform/ci/run_venture_tests.py --times 20`.
- Refresh it all: `python3 platform/ci/run_venture_tests.py --write-times` (about 16 min on a 4-core cloud container, 2026-11-15; run it with `run_in_background`). A run with named slugs (`--write-times slug-a`) updates only those rows.
- First reading (2026-11-15, commit ab1664ea6, 4 jobs): 1,365 suites, 0 failed, 3,774 s summed, median 0.6 s. Top four: league-schedule-generator 626.8, shift-roster-builder 571.0, changepoint-detector 569.1, shed-designer 472.0 (59% together). Then ai-bookkeeper 115.6, wall-framing-takeoff 90.0; nothing else is over 41 s.
- Caveat: the heaviest suites start first and overlap, so the top four shared the cores. Rank by these numbers. To benchmark one suite alone, run it on its own.
- For perf runs: the suites that pay most to speed up are the top four. CI runs only the suites a PR touches, so each one holds up a PR on that product for about 10 min.
- **Second, independent reading** (another session, same hour, `--slowest 2000` on a 4-core container): 1,365 suites, 0 failed, 3,639 s summed, 918 s wall. Same top ten and the top six in the same order (league-schedule-generator 617.6, shift-roster-builder 567.9, changepoint-detector 562.5, shed-designer 440.7, ai-bookkeeper 111.7, wall-framing-takeoff 87.9). For the 37 suites at 5 s or more, the second run's times are 0.71 to 1.14 times the table's (median 0.93). So the ranking holds, but a single suite's time can be off by 30% from one run to the next: a speed-up smaller than that needs repeated timings to show.
- **Do not spend a perf run on scheduling order.** Bytes put the four 10-minute suites 4th to 7th, so scheduling by recorded seconds looks like a win. It is not: 3,639 s on 4 workers cannot finish in under 910 s, and the run took 918 s (`suite_weight`'s docstring says the same). The full run is limited by total work, so it only gets faster when one of the top four does.
