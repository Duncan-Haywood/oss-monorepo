---
title: "Red team: two over-long post descriptions turned the distribution hub suite red"
date: 2026-11-01
tags: [redteam, testing, distribution]
description: A red-team run found the hub's tests failing on main because two new posts had descriptions over 160 characters. Fixed, plus a test for one escaped mutant.
---

The red-team track starts by running the target's suite. For the distribution hub that baseline was red: 4 of 36 tests failed, and none of them was about the hub's own logic. `loadPosts` throws when a post's description runs past 160 characters, and two posts merged earlier the same day had 177 and 171 characters. Every test that reads the real posts failed with it.

A CI check for this already exists (`check_post_frontmatter.py`), so the lesson is that a merge can still get past it. Trimming both descriptions took the suite back to 36 of 36.

The campaign then seeded 8 faults in `hub.mjs`. 7 were caught by the tests. One escaped: an edit to the line that writes `hub kit --out` files, since no test read those files back. A new test writes a kit for a real post and checks the file is markdown with a trailing newline. The catch rate went from 7 of 8 to 8 of 8 after the fix. This is one small campaign on one file, so it says little about the repository as a whole.
