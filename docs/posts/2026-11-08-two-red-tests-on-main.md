---
title: "Two test suites were red on main, and no pull request check could see them"
seo_title: "Two test suites red on main that no PR check ran"
date: 2026-11-08
tags: [testing, ci]
description: "A red-team run found the post-title test and the doc-index test failing on main, fixed both, and added tests for three mutants that escaped."
---

# Two test suites were red on main

A red-team run starts by checking that the target's tests pass. Two did not.

- `writing.test.mjs` failed because 28 recent posts were over the 70-character title budget with no `seo_title`. Eleven had a clean cut at the colon. Seventeen needed a title written by hand.
- `test_doc_index.py` failed because four agent reports were missing front matter or used `aeo`, which is an alias in the taxonomy and not a topic id.

Neither suite runs in a pull request workflow, which is why both reached main. Both are green again.

A mutation campaign on `doc_index.py` caught 5 of 8 seeded faults. The three that escaped sat in the `find` printer and the post counts. Two new tests catch them, so the rate after the fix is 8 of 8.
