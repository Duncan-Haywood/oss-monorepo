---
title: "72 test suites no pull request ran, and the two that were red"
seo_title: "Finding CI test suites that no pull-request workflow runs"
date: 2026-11-13
tags: [redteam, ci, testing]
description: "72 of 121 test suites in our CI tooling ran on no pull request. Two were red on main. One script now runs every unwired suite in about 20 seconds."
---

This repository's `platform/ci/` folder holds the checks that guard everything
else: link checkers, an honest-marketing lint, the browser-check registry and
121 `test_*.py` suites for those tools. Today's red-team run asked a plain
question first: does each suite actually run when someone opens a pull request?

**72 of the 121 did not.** 71 appeared in no workflow file at all. One more,
`test_browser_checks.py`, appeared only in a nightly workflow. A suite like
that can go red at merge and stay red until somebody happens to run it by hand.

Two had done exactly that:

- **`test_browser_checks.py`** has a test that fails when a browser check in
  `platform/pages/` is written but never registered, so nothing runs it.
  Four such modules had collected there (`ask-voice-icon`, `band-gap`,
  `sticky-fit-check` and `lighthouse`). The test also stopped at the first
  offender, so fixing one revealed the next. It now names them all at once.
  The three pass/fail checks wait in a `pending` list until a workflow PR
  registers them. `lighthouse` is listed as run-by-hand, because it reports
  scores rather than passing or failing.
- **`test_doc_index.py`** checks that every agent report in `docs/reports/`
  carries front-matter tags from `docs/taxonomy.json`. 44 problems had piled
  up across 36 reports: 23 with no front matter and 21 with topics outside the
  vocabulary. The tool's own `backfill --write` fixed most of them. Five of
  the stray topics (`responsive`, `mobile`, `forms`, `headings`, `tooling`)
  were plain synonyms of existing ones, so they became aliases rather than
  one-off edits. The next report that uses them is mapped automatically.

**The fix for the class, not the two instances.** `platform/ci/unwired_checks.py`
already ran every `check_*.py` script that no workflow names. It now also runs
every `test_*.py` suite that no *pull-request* workflow names. It reads each
workflow's `on:` block rather than searching the whole file for the string
`pull_request`. That matters: the nightly browser workflow contains the string
twice, once in a comment saying it deliberately has no such trigger and once
in a `github.event.pull_request` expression. All 104 unwired checks and
suites run in about 20 seconds, six at a time. With today's two fixes undone,
the run goes red and names the suite and the command that reproduces it.

**A real bug in the marketing lint, too.** `check_social_proof.py` keeps
unbacked claims like "trusted by 10,000 teams" off our pages, but lets a line
through when it is attributed to someone else or is a format example. "Such
as", "sample" and "example" counted as attribution anywhere within 120
characters, so the most common fake-logo line passed:

> Trusted by teams such as Acme and Globex.

So did "Trusted by 2,000 firms. Download a sample invoice." Those words now
excuse a claim only when they come *before* it ("phrases such as 'trusted
by'"). The check also catches "loved by 10,000+" and "join thousands of". The
6,537 pages it scans are still clean, so nothing on the site was relying on
the loophole.

**Mutation numbers.** Sixteen seeded faults across the two guards: the tests
caught 10, and 1 was equivalent (it could not change any visible behaviour).
`unwired_checks.py` had never had its exit code tested, though CI reads
nothing else from it. Its new tests catch all five faults that got through,
for a catch rate after the fix of 15 of 15.

**What is still open.** `ventures-tests.yml`, which runs the unwired set,
triggers only on PRs that touch `ventures/**`. A docs-only or
`platform/pages`-only PR, which is how both of today's reds landed, still
skips it. Widening those paths is a workflow edit, so it waits for the
owner's approval in its own small PR.
