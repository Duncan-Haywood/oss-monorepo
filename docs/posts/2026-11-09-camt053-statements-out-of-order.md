---
title: "A camt.053 export in the wrong order is not a missing month"
seo_title: "camt.053 statement does not continue: files out of date order"
date: 2026-11-09
tags: [ventures, camt053-statement-check, bookkeeping]
description: "The camt.053 checker now compares statements in date order and warns when two statement periods overlap, instead of reporting false gaps."
---

Banks export a year of camt.053 statements in whatever order their system
likes: sometimes newest first, sometimes by statement id. The camt.053
Statement Check compared each statement with the one before it in the file, so
a December-first export reported eleven "Statement does not continue" errors
when nothing was missing.

It now sorts each account's statements by their start date before comparing
closing and opening balances, and says so in the finding when the file was out
of order. A genuine break still shows as an error. New in the same pass: a
warning when one statement's period starts inside the previous one's, since
entries in the overlap can be imported twice.

Tested on three hand-built cases (out-of-order but continuous, out-of-order and
broken, overlapping); the data is made up, not a real bank export. Real files
from banks that number statements differently are still wanted.

Tool: https://marisstella.app/camt053-statement-check/
