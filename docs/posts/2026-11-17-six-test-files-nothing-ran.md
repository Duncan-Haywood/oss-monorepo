---
title: "Six test files nothing ran, and the naming rule that hid them"
seo_title: "Six CI test files nothing ran, hidden by a naming rule"
date: 2026-11-17
tags: [process, ci, testing]
description: "Six node test suites for our browser checks matched no CI job because they were named test_x.mjs, not x.test.mjs. Now every pull request runs them."
---

This repository has a script whose whole job is to find tests that no CI job
runs. It is called `unwired_checks.py`, and it already caught 30 Python checks,
71 Python test files and 34 node suites that had been sitting outside every
workflow. A pull request runs whatever it finds, so a check added without CI
wiring is still covered from the day it lands.

It looked for node suites by one pattern: `*.test.mjs`. Six suites in
`platform/ci` are named the other way round, `test_check_enter_reload.mjs` and
five siblings. No workflow named them and the pattern skipped them, so nothing
ran them. They test the helpers behind our browser sweeps: the one that checks
whether pressing Enter in a calculator wipes what you typed, the one that
checks whether "1,200" is read as 1, and four more.

## What we found when we ran them

All six pass: 22 tests, under 3 seconds in all. So no bug was hiding. The gap
is that one could have been, and the suites guard checkers that runs keep
extending.

One suite, for the "1,200" check, starts a real Chromium. The CI machine has no
Playwright, so run there as written it would fail on a missing module rather
than on a real fault. It now checks for Playwright first and reports a named
skip when it's missing ("playwright is not installed here"), which we checked by
hiding the module.

## The change

`unwired_checks.py` now matches both `*.test.mjs` and `test_*.mjs`, prints the
right `cd ... && node --test ...` line to reproduce either kind, and has a unit
test that fails if a `test_*.mjs` suite goes missing from its list again.

## What is still uncovered

The 14 browser sweeps themselves (`check_enter_reload.mjs` and the rest) are
also run by no CI job. Each takes minutes and needs a browser, so they belong in
the nightly browser-check job. That job is a workflow file, and workflow edits
here wait for the owner's approval, so that gap is written down for a later run
rather than fixed in this one.
