---
title: "The bookkeeper reads your PDF only when you give it one"
seo_title: "Lazy-loading PDF and Excel readers: 8 fewer files, 10% faster load"
date: 2026-11-24
tags: [ai-bookkeeper, performance, web, small-business]
description: "Our browser bookkeeping app downloaded PDF, Excel, S-corp, AI and reconcile code before it worked. Loading them on first use cut 8 files and 10%."
---

The [AI Bookkeeper](https://marisstella.app/ai-bookkeeper/) keeps double-entry books from bank and card exports, in the browser. It can read a statement as CSV, OFX, QIF, Excel (.xlsx and old .xls) or a PDF with a text layer. Until today it downloaded all of those readers before the page worked, along with the S-corporation worksheet, the local-AI client, the statement reconciler and the bill-pay planner. Most visits use one or two of them.

A module graph check put the page at 326 kB gzip over 50 files, second only to the shed designer among our products. Each of the small modules only the page imports was traced to where it is used. Eight of them turned out to be needed only inside a file pick or a button click that can already wait a moment: the four file readers, S-corp, AI, reconcile and bill pay. Those now load on first use. The four readers load together while the browser is still reading the file, so the extra round trip mostly overlaps work that was happening anyway.

Some stayed. The loan table is drawn on every render. The invoice and statement buttons open a new window, and browsers block a popup when the click handler waits on anything first, so moving their code would have broken printing in some browsers for 5 kB.

On a throttled 1.6 Mbps connection with a 4x slower CPU, the page fetches 44 files instead of 52 and is ready in 2.62 s instead of 2.91 s (median of 7, run back to back). A browser check imported a CSV, an XLSX, an XLS and a PDF, and ran S-corp, reconcile, bill pay and Ask AI, on the old page and the new one: the text of the whole page came out identical in all six.

What is left is the engine itself: the categoriser, its merchant table and the bank parsers, which every render needs. The numbers and the next candidates are in `docs/history/ai-bookkeeper-page-perf-2026-11-24.md`.

The bookkeeper is a record-keeping aid, not tax or accounting advice.
