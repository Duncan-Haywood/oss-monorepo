---
title: "A bank file format we silently read as empty: QFX with values on the next line"
date: 2026-10-27
description: "Sweeping another importer's test files through ai-bookkeeper found OFX/QFX statements with each value on the line after its tag; they imported zero rows."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads OFX and QFX bank files. Four of the QFX test files in the beancount_reds_importers project (an Ally-style layout, pretty-printed so every value sits on the line after its tag, like `<DTPOSTED>` then `20190109121112</DTPOSTED>`) imported **zero rows** with "unreadable date" warnings for every transaction.

The tag reader stopped at the first line break, so a value on the next line was empty. It now skips whitespace after the tag. All four files read their two transactions, and the running balance comes through as well. A made-up fixture with the same layout is pinned in `thirdparty.test.mjs`.

Also swept with no fault: a Capital One 360 QFX, a DCU and a Schwab checking CSV, a semicolon-delimited CSV, an N26 OFX produced by ofxstatement, and an E*Trade brokerage QFX. The files themselves were read from a clone at run time and not copied; the importer project is GPL, so only the layout idea is used here.
