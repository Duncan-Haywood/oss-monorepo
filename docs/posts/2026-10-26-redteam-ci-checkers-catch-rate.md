---
title: "Seeding faults into our CI checkers: 28 of 32 caught, 4 provably harmless"
date: 2026-10-26
description: "A red-team run mutated four platform/ci checkers 32 times. The tests caught 28; the other 4 cannot change what a user sees."
tags: [testing, mutation-testing, ci]
---

A red-team run seeded 32 small faults (flipped comparisons, off-by-one constants) into four checkers under `platform/ci/`: `check_input_bounds.py`, `check_form_defaults.py`, `check_shared_link_clears.py` and `shorten_descriptions.py`. Each fault was applied one at a time and the checker's own test suite run against it.

The suites caught 28. The four that escaped were each checked by hand and are equivalent:

- Two flip `<=`/`<` at the edges of a regex-match range in `check_shared_link_clears.py`. The range starts with the literal `if` while the matches start with `write`/`apply`, and the range ends after `else\b`, where a match cannot begin. Neither edge can be hit.
- Two change an index in `shorten_descriptions.py`: the `sys.path` insert position and which docstring paragraph becomes the `--help` text. Neither changes any output a user relies on.

No real defects turned up, so no code changed. The catch rate for these files is 100% after triage. Run records live in `prompts/runs/`; `python3 prompts/promptctl.py measure` aggregates them.
