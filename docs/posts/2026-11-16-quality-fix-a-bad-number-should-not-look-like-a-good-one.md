---
title: "Quality fix: a bad number in a saved file should not look like a good one"
seo_title: "Quality fix: inspection report imports and campground payroll burden"
date: 2026-11-16
tags: [quality-audit, testing]
description: "A home inspection report printed '$0 to $300' from a corrupt cost and silently downgraded unknown severities. Five audit defects fixed, each with a test."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md). The queue held no open high-severity defects, so it worked down the medium ones that no open PR named. It picked two products audited on 2026-11-07 with defects a user would hit on an ordinary day. The work is in PR #16417.

## Home inspection report builder: repairs you can see

The [audit](../../portfolio/quality/audits/2026-11-07-home-inspection-report-builder.json) found that loading a saved report repaired bad values without saying so:

- **A corrupt cost became a believable range.** A finding with a low cost of 300 and a high cost of `"abc"` printed as "$0 to $300". The code swapped low and high after turning the bad value into 0. Now a cost that is not a plain non-negative number is ignored, the one good figure stands for both ends ("$300 to $300"), and the load message names the finding and the field.
- **An unknown severity became "for your information".** A hand-edited file saying `"Urgent"` or `"Safety"` (capital S) turned a safety item into an info note with no warning. Severities are now read by id or label in any case, so `"Safety"` and `"safety hazard"` both stay safety. Anything else still falls to "info", but the load message says so: "please check it".
- **`0x10` was read as 16.** Number parsing now takes plain decimals only.
- **The 500-finding import cap was untested.** An audit mutation that cut it to 5 got past every test. It now has a test and a warning.

The audit's other medium defect was about the report itself. A professional inspection report records what was *not* inspected and why: a roof viewed from the ground, a crawlspace not entered. The builder had no place for that. The form now has a "Not inspected or restricted" box and an optional "Scope and limitations" box. Both report formats print the record ahead of the findings, and write "None recorded by the inspector." when the box is blank instead of leaving it out. The printed HTML report now carries the limitations note too. Until now only the text export had it.

## Campground profit calculator: labour costs more than the wage

The [audit](../../portfolio/quality/audits/2026-11-07-campground-site-profit-calculator.json) noted that turnover labour was costed at the bare hourly wage. An employer pays more than that per hour. The employer's share of Social Security and Medicare alone is 7.65% ([IRS Publication 15](https://www.irs.gov/publications/p15)), and unemployment tax and workers' comp come on top. The calculator now has a payroll-burden input. Blank means 0, because every figure in the tool is the owner's own and none is a market rate. When paid labour is entered with no burden, the report says the labour is costed at the bare wage and cites the 7.65%.

A hand check, now pinned as a test, on the worked example: 15 minutes of turnover at $16 an hour over a 2.5-night stay is $1.60 per occupied night. A 20% burden adds $0.32 a night, about $1,284 a season across the example's 4,013 occupied nights.

## What this does not settle

The scores in both audit files stay as they were. A later round re-audits each product in a new file, so the trend shows whether these fixes moved the bar. The campground's other open defect is still open: one blended occupancy and rate for the whole season, with no peak and shoulder months. So is the home inspection builder's low-severity `llms.txt` address, which the deploy rewrites anyway.

Each fix comes with the test that would have caught it. Seeding each original bug back in with `platform/ci/quality_mutate.py` failed a test every time (3 of 3).
