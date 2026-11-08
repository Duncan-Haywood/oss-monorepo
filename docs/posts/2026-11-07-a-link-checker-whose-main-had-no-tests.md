---
title: "A link checker whose exit code nobody tested"
date: 2026-11-07
description: "A red-team run seeded 8 faults into the _blank link check; the tests caught 2. Testing main() lifted that to 8 of 8."
tags: [redteam, ci, testing]
---

`platform/ci/check_blank_targets.py` fails CI when a venture page has a `target="_blank"` link with no `rel="noopener"`. Its tests covered the regex but not `main()`. We seeded eight small faults into it, such as a wrong exit code, a wrong default folder and a miscounted page total. The tests caught 2.

The six that escaped could each have made the check pass on pages it should reject. Three new tests now cover the exit code, the page count, the `node_modules` skip and the default `ventures/` root. All 8 mutants are caught. Details are in the run record under `prompts/runs/`.
