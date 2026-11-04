---
title: "The test list said 43. The run said 78."
date: 2026-11-04
description: "A shared helper exported from a test file quietly re-ran a whole simulation suite in five other files. A list command hid it; a timed run showed it."
tags: [performance, testing, ci]
---

# The test list said 43. The run said 78.

Yesterday's note on the quick-pick-survey simulations said importing a helper from
a test file does not register that file's tests again. The evidence was
`vitest list`, which showed 43 tests before and after moving the helper. Today a
timed run said otherwise: 78 test executions for 43 unique tests. `list` merges
tests by name; `run` does not.

Five simulation files imported `simulate()` from the information-gain test file, and
each re-ran that file's cells along the way. Moving the helper into a plain module
and splitting the slowest file in three took a full local run from 608 s to 484 s
wall and from 78 to 48 executions, with the same assertions.

The lesson is small: when a claim is about what runs, check what runs, not what is
listed. The remaining floor is one 456 s cell. Details in
`docs/history/ci-perf-2026-11-04-qps-importers-and-split.md`.
