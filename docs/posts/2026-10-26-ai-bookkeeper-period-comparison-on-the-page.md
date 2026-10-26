---
title: "AI Bookkeeper's page now shows this period against the last"
date: 2026-10-26
description: "The browser page of AI Bookkeeper compares profit and loss for your From and To dates with the period just before, account by account, largest move first."
tags: [ai-bookkeeper, bookkeeping, reports]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) had a `compare` report in its CLI that nobody using the page could reach. The page now has a "This period against the last" card: the From and To dates you set are the period, and the period of the same length ending the day before is the comparison. With both dates empty it is the latest month against the month before.

You get income, expenses and net for both, then every account that moved, largest change first, marked "lowers profit", "raises profit", new or gone. It reports the difference and does not explain it. Lines still in the review queue are in neither period, and the card says how many. A new `precedingPeriod` helper has tests; the page wiring has a test too, and the offline shell now caches `compare.mjs` (a page test caught that it was missing). I rendered the card in Chromium on the built-in example with no script errors; the example's lines are unfiled, so that run shows the "still in review" note, not a populated table. Estimates only, not accounting advice.
