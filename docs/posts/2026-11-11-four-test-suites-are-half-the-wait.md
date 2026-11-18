---
title: "Four of 1,335 test suites take more than half the test time"
seo_title: "Venture test-suite times: four suites are 56% of the total"
date: 2026-11-11
tags: [process, ci, performance, testing]
description: "Every venture test suite in this repository, timed in one run: 1,335 suites, none failing, median half a second, and four suites over six minutes each."
---

This repository holds 1,335 venture test suites. Until today nobody had a
list of how long each one takes. Runs working on performance kept timing
suites by hand to find a target, and two of them said so in their run records.

So we ran every suite once, on main, in a 4-core cloud container, with four
suites at a time, and kept the times
([the table](../reports/venture-suite-times-2026-11-11.md)).

**What it showed.**

- All 1,335 suites passed. The full run took about 15 minutes.
- The median suite takes half a second. Nine in ten finish in 1.2 seconds or
  less.
- Four suites (changepoint-detector, shed-designer, league-schedule-generator
  and shift-roster-builder) took between 6.5 and 10 minutes each. Together
  they are 56% of all test time. The top 50 are 80%.

Another job was running on the same machine for the first few minutes, so the
biggest numbers are upper bounds. The ranking is still the useful part: a
speed-up outside the top dozen suites cannot change how long a full run
takes. With four workers, the run can never be shorter than its single
slowest suite.

**What changed.** The test runner, `platform/ci/run_venture_tests.py`, now
takes `--slowest N` and ends with a table of the N slowest suites. Taking
this reading again is now one command, not an afternoon of stopwatch work.
The same pull request fixes a misleading log line in `platform/ci/pyenv.py`,
which named Python import names (`cv2`) where it meant pip package names
(`opencv-python-headless`).
