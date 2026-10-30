---
title: "Clicking the download button: season grid CSV in a real browser"
date: 2026-10-30
tags: [league-schedule-generator, testing]
description: "The multi-division season grid button was only tested through its function. A Chromium run now clicks it and checks the file."
---

The [league schedule generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/) added a season grid CSV for multi-division leagues earlier today, with a CLI flag and a page button. Only the function behind the button had tests, so a broken click handler would have passed them.

`eval/browser-click.mjs` now builds the example league in Chromium, clicks "Download season grid CSV" and reads the file. It checks the filename (`division-season-grid.csv`) and that the file has a header and rows (21 lines for the example). The whole script passes with no page errors.

This checks that the button produces a file with the right shape, not that a league secretary finds the grid useful. That still needs a real league's travel times and schedule.
