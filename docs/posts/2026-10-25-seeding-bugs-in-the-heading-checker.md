---
title: "We seeded 8 bugs in the heading-order check; its tests caught 2"
date: 2026-10-25
description: "A red-team run on platform/ci/check_heading_order.py: six of eight seeded faults escaped, and the new tests catch all six."
tags: [redteam, ci, testing]
---

`platform/ci/check_heading_order.py` fails CI when a page skips a heading
level. A red-team campaign seeded eight small faults into it (a flipped
comparison, a wrong exit code, an off-by-one in the output splice). Its suite
caught two. The six that escaped included `main()` ignoring its file
arguments, the exit code becoming 2, and `--fix` dropping the first character
of a page that had text before its first heading.

Four new tests close those holes: leading text and headings after comments
under `--fix`, a stray closing tag, and `main()` run on a temporary file with
and without `--fix`. A rerun of the six escaped mutants now shows all caught,
so the catch rate on this file went from 25% to 100%. No real defect turned up.
