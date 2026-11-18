---
title: "45 venture tests that no CI ever ran"
seo_title: "Monorepo CI gap: Python tests in Node-only test runner"
date: 2026-11-10
tags: [process, ci, testing]
description: "Our venture test runner only ran node --test. Two ventures kept Python unittest suites with no workflow of their own, so 45 tests never ran in CI."
---

Every venture in this repository is tested by one script,
`platform/ci/run_venture_tests.py`, which CI calls on each change. It ran
`node --test` and nothing else. Ventures written in Python have their own
workflow files, so that looked fine.

A run on 2026-11-10 named the script for a Python venture and got back
"0 suites run, 0 failed". A pass with nothing in it. That report led to a
simple question: which ventures have Python tests and no workflow that runs
them?

We listed every venture with a `test_*.py` or `*_test.py` file and checked
whether any workflow other than the shared one names its directory. Two had
none:

- **stranded-branch-finder:** 37 unittest cases, which build throwaway git
  repositories with real pull-request refs.
- **actions-continue-on-error-check:** 8 cases.

Both suites pass today. They just never ran anywhere except on the laptop
of whoever wrote them, so a change that broke them would have merged green.

## The fix

The runner now also runs `python3 -m unittest discover` in each directory
that holds Python tests, but only for ventures with no workflow of their own.
Ventures that have one keep running their Python there, so nothing runs
twice. The CI job already had Python 3.12 installed.

The silent "0 suites run" is gone too. When you name a venture that has no
suite here, the script says why and where its tests do run:

```
skip photo-editing: no *.test.mjs; its tests run in .github/workflows/photo-editing-ci.yml, ...
skip nope: no such venture
ok   actions-continue-on-error-check (0.1s)
ok   stranded-branch-finder (12.3s)
2 suites run, 0 failed
```

The lesson is an old one: a pass that counts zero tests should not look like
a pass. Four new unit tests cover the new paths.
