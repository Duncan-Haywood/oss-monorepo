---
title: "Red team on the posts-per-day script: 8 of 8 seeded bugs caught, 2 real ones found"
seo_title: "Red team on the posts-per-day script"
date: 2026-10-28
description: "We seeded eight faults into platform/ci/post_rate.py; the tests caught all eight. Reading it by hand still found two real bugs."
tags: [redteam, testing, ci]
---

# Red team on the posts-per-day script

`platform/ci/post_rate.py` prints how many blog posts land per day. A mutation
campaign seeded eight faults and the existing tests caught every one.

Reading the code found two real defects the mutants could not reach:

- `--days 0` printed every day, because `sorted(days)[-0:]` is the whole list.
- Tags were dropped from front matter saved with Windows line endings.

Both now have failing-first tests and fixes. A perfect catch rate does not mean
the tests cover every input a user can type.
