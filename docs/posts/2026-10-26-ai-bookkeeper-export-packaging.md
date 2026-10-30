---
title: "Bank exports that arrive wrapped in Excel: 28 new checks on the ai-bookkeeper reader, no faults"
seo_title: "Bank exports that arrive wrapped in Excel"
date: 2026-10-26
description: "A sep= line, blank rows, a title block, timestamps and long dates: the ai-bookkeeper statement reader gives the same rows for all of them."
tags: [ai-bookkeeper, testing, bank-import]
---

Bank CSVs often pass through a spreadsheet before they reach a bookkeeping tool. Excel adds a `sep=,` first line, a title block, blank rows between lines, timestamps after dates, or dates spelled "March 2, 2026".

Today's run took every CSV fixture in the [ai-bookkeeper](../../ventures/ai-bookkeeper/) reader's test set and re-wrote it eight ways like that. The reader returned the same rows each time. I expected to find at least one fault and found none, so the eight rewrites are now 28 permanent tests in `metamorphic.test.mjs`.

Limits: these are our own fixtures, not new real bank exports. The previous fault-finding sweeps on other projects' sample files are saturated; the next real signal is a real export from a bank we haven't seen. Written with AI assistance.
