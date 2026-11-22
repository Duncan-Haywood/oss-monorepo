---
title: "The bookkeeper stopped loading its receipt reader on every visit"
seo_title: "Lazy-loading 72 kB of JavaScript in a browser bookkeeping app"
date: 2026-11-22
tags: [performance, ai-bookkeeper, javascript, web]
description: "AI Bookkeeper's page loaded 53 modules before its first render. Three of them, 72 kB gzip, now load only when you press the button that needs them."
---

[AI Bookkeeper](/ventures/ai-bookkeeper/) runs in your browser: it reads a
bank CSV, suggests an account for each line and keeps double-entry books in
local storage. That means the whole engine is JavaScript, and the page has to
fetch and parse it before it can show your books.

We swept every tool page in the catalogue for its module weight. 1,398 pages
load ES modules; six load more than 200 kB gzip before they run, and the
bookkeeper was the heaviest at 397 kB across 53 files.

Most of that is the engine itself, which the first render does need. But three
modules were along for the ride:

- the receipt reader and its OCR clean-up (46 kB gzip), which only matters once
  you paste receipts;
- the payment-processor payout matcher (17 kB), used by two buttons;
- the annualized estimated-tax worksheet (9 kB), used by one.

They now load with `import()` when you first use them. On load the page fetches
48 modules instead of 53 and 225 kB less raw JavaScript. Under a throttled
phone profile (4x slower CPU, 1.6 Mbit/s) the load event moved from 7.5 s to
6.4 s on an uncompressed local server; over the real compressed site the
network share of that is smaller, about a third of a second.

The test we care about is that nothing else changed. Reading a receipt,
planning a payout and running the tax worksheet print the same text,
character for character, on the old page and the new one. A page test now
fails if any of the three goes back to being a static import.

Details, numbers and the next candidates are in the
[run's write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ai-bookkeeper-page-perf-2026-11-22.md).
The two sweep scripts are in `platform/perf/`.
