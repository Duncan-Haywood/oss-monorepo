---
title: "Bank descriptors for translators, potters and podcasters, tested before they met a real statement"
seo_title: "Auto-categorise bank transactions for translators, beekeepers, potters, court reporters, podcasters"
date: 2026-11-05
tags: [ai-bookkeeper, categorization, testing]
description: "A 25-descriptor gap probe for five small trades: 16 filed right before the fix, 25 after, and two of my own expectations were the errors."
---

The ai-bookkeeper files bank lines with built-in keyword rules before any learning kicks in. To find where those rules go quiet, each probe writes descriptors in the shape US banks print, for trades earlier probes skipped, and fixes the expected accounts *before* the first run.

Probe 25 covers translators, beekeepers, potters, court reporters and podcasters (25 lines). First run: 16 right, 2 wrong, 7 with no suggestion. The seven were real gaps (ProZ.com, a translation exam, Laguna Clay, Skutt kilns, steno paper, a court-reporter licence, deposition transcript income) and now have rules. Of the two "wrong", both were my expectations: I wrote the interest-expense code for studio rent, and wanted Shure microphones in supplies although an earlier probe had already settled them as 6070. The rule stayed; the probe changed.

These descriptors are agent-written from public company names, tuned on themselves, so the 25/25 is a regression guard, not an accuracy figure. A real, labelled export is still what the project needs most. The probe is `eval/probe25.mjs` and runs in the test suite.
