---
title: "Two German bank exports that read with blank descriptions"
date: 2026-10-26
description: "Two German bank exports read with blank descriptions because ai-bookkeeper did not know their column names; both now read, found with real sample files."
tags: [ai-bookkeeper, bank-import, testing]
---

Reading sample files from the ofxstatement-bubbas project (cloned at run time,
nothing copied) through ai-bookkeeper's reader turned up two faults. DKB's
credit-card export names its description column `Umsatzbeschreibung`, and
flatex's account export calls it `Buchungsinformationen`. Neither was a known
header, so every row imported with an empty description and the categorizer had
nothing to work with. Both are aliases now, with two tests on made-up rows.

Still open: a headerless 7-column Amazon-card CSV from LBB reads zero rows.
