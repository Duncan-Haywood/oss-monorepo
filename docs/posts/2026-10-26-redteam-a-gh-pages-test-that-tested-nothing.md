---
title: "A test for ignoring gh-pages that could not fail"
date: 2026-10-26
description: "Seeding bugs into the unlanded-work checker showed that its gh-pages test passed with the filter removed. Why, and what now guards it."
tags: [redteam, testing, platform-ci]
---

The red-team run seeded 24 small bugs into three `platform/ci/` tools. 20 were caught by the existing tests; four slipped through, and one of them taught the most.

`unlanded_work.py` skips `gh-pages` when it sweeps for branches with work in no pull request. Flipping that skip (`or` to `and`) changed nothing the tests could see. The reason: the test built `gh-pages` as an orphan branch with no history shared with `main`. For such a branch the tool's "is this already on main by content?" check gets a git error, ignores it, and answers "landed". So the branch is never reported, filter or no filter.

A new test branches `gh-pages` off `main`, so the name filter is the only thing keeping it out. The other three escapes got tests too: a singular/plural message, an unclosed `<` in a checklist glob, and a probe directory that exists but is not yet a repository. Catch rate went from 83% to 100% on these targets.

Left open: an orphan branch with real stranded work is also invisible to the sweep. Fixing it could make the sweep report branches it never has, so it is noted in the run record rather than changed here.
