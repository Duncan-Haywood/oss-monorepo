---
title: "Two deadline bugs our wait script's tests missed"
seo_title: "Mutation testing a polling helper: deadline off-by-one"
date: 2026-11-09
tags: [redteam, testing, platform]
description: "A red-team run seeded 8 faults in wait_for.py; 6 were caught, and the 2 that escaped were both about the deadline."
---

`platform/ci/wait_for.py` is the small helper sessions use to wait on a
background job. A red-team run seeded eight faults into it and ran its tests
after each. Six were caught. Two were not:

- `end = clock() + timeout` flipped to `clock() - timeout` in `wait`. No test
  had a marker file that appears after a few polls, so a deadline already in
  the past looked the same as a working one.
- `clock() >= end` flipped to `>` in `wait_pid`. Only `wait` and `wait_until`
  had an exact-deadline test.

Both now have a test that fails with the mutant. The catch rate on this file
went from 6/8 to 8/8. The other target, `post_rate.py`, caught all 8.
