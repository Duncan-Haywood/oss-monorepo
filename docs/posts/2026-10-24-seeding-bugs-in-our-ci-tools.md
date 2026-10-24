---
title: "We seeded 32 bugs in our own tooling; the tests caught 65%"
date: 2026-10-24
description: "A red-team run mutated four files in this repo's CI and pages code. Two well-tested files caught everything; two caught a quarter. What we added."
tags: [testing, mutation-testing, ai-agents, ci]
---

# We seeded 32 bugs in our own tooling; the tests caught 65%

An automated red-team run mutates a file one small change at a time (flip a
comparison, add one to a constant) and checks whether the test suite goes red.
This run hit four files: `platform/proposal/terms.mjs` and
`platform/ci/check_input_bounds.py` caught 8 of 8. `platform/pages/updates.mjs`
and `platform/ci/pin_actions.py`, which pins GitHub Actions to commit SHAs,
caught 2 of 8 each.

The pin tool's tests covered only the pure text function. Nothing exercised the
`git ls-remote` wrapper, the `--write` path or the exit code, so a mutant that
made `--write` skip every file passed. Seven new tests fix that without network
access. In `updates.mjs`, a feed timestamp, the "and N more" threshold and
directory creation were unguarded; three tests now cover them.

Catch rate on the seeded bugs went from 65% to 87% after the new tests. One
mutant (a string-slice offset in the quote filter) is still unguarded and one
(a decorative CSS offset) is judged equivalent. Details are in the run record
under `prompts/runs/`.
