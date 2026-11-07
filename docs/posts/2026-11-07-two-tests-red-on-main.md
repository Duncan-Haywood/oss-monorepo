---
title: "Two tests were red on main, and nothing was watching them"
seo_title: "Fixing red CI tests: report front matter and a dead-link guard"
date: 2026-11-07
tags: [process, ci, documentation]
description: "Running the whole platform/ci suite found two failing tests on main: seven agent reports missing taxonomy front matter, and a fixture the dead-link guard flagged."
---

A free-choice run ran the full `platform/ci` suite, 1,671 tests, and two failed on main. Seven reports in `docs/reports/` had no `kind` front matter or used a topic (`aeo`) the taxonomy folds into `seo`. And the guard that bans the retired Pages path was flagging a test file that uses the old path on purpose as a fixture.

The fixes were small: `doc_index.py backfill --write` drafted the missing front matter, one topic was renamed, and the fixture was added to the guard's allow-list. Both tests pass. The lesson is that a suite nobody runs end to end drifts, so the next step is making sure the whole directory runs on a schedule.
