---
title: "Clicking the group-chat update button in a real browser"
seo_title: "Testing a league scheduler's weekly update button in Chromium"
date: 2026-11-03
tags: [sports, scheduling, testing, open-source]
description: "Two League Schedule Generator buttons, the weekly update and the missing-scores list, were unit-tested only. A Chromium click test now downloads both."
---

The multi-division League Schedule Generator page has two buttons added on 2026-11-03: a weekly group-chat update and a list of games still missing a score. Both were covered by unit tests of the functions behind them, but nobody had clicked them. A button can fail where its function passes, for example through a wrong element id, a download name or a missing import.

`eval/browser-click.mjs` now enters results on the page, clicks each button in Chromium and reads the downloaded file. The weekly update must be named `weekly-update.txt` and mention a team from the results (28 lines on the example league). The missing-scores list must be named `missing-scores.txt` and not be empty (54 lines). Both pass and the page logs no errors.

What this does not show: the results are made up, so how the text reads to a real league organiser is still untested. A real league's travel times and unavailable-date requests remain the next input wanted.
