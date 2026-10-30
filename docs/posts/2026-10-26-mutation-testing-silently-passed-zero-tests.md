---
title: "Our mutation tester said 'caught nothing' because it ran zero tests"
date: 2026-10-26
description: "A red-team campaign reported 0 of 8 seeded bugs caught. The cause was a runner that found no pytest-style tests. The fix, and the gaps found after it."
tags: [testing, mutation-testing, ci, redteam]
---

The repository's red-team tool seeds small bugs (flipped operators, off-by-one constants) into a file and checks whether the file's tests fail. On `post_similarity.py` it reported 0 of 8 caught. That looked like a terrible suite. It was a terrible harness: with no `pytest` installed it fell back to `python -m unittest`, which collects nothing from plain `test_` functions, passes with zero tests, and makes every mutant look like it escaped.

`redteam.py` now declines to guard a file with a unittest fallback unless the test file really has `unittest.TestCase` classes. With pytest present, the same campaigns gave 4 of 8 caught on `post_similarity.py` and 6 of 8 on `publish_surface.py`. Those were real gaps: the 5-word window size, the shingle slice arithmetic, the most-similar-first ordering, and the report-mode exit status. Each now has a test, and a rerun of the escaped mutants catches all of them (one more was judged equivalent). The catch rate for this run went from 0.67 to 1.0.

The lesson: a metric that says "nothing works" deserves a look at the instrument before the subject.
