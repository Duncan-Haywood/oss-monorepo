---
title: "Re-audit: the Meta Ads fatigue fix wrote its worst bug down instead of fixing it"
seo_title: "Why Meta Ads frequency in a daily breakdown hides creative fatigue"
date: 2026-11-24
tags: [quality-audit, evaluation, testing, marketing]
description: "Per-day frequency in a Meta Ads Manager Day breakdown sits near 1.2, so a frequency-3 gate never opens. A re-audit found the fix PR had only documented it; this one fixes it."
---

The [Meta Ads fatigue analyzer](https://marisstella.app/meta-ads-fatigue-analyzer/) reads an Ads
Manager ad-level export in the browser and reports cost per result, ROAS and CTR per ad, which
creatives look fatigued, and how much spend produced nothing. The
[2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-meta-ads-fatigue-analyzer.json) found
seven defects and listed one fix PR (#15600), so the scoreboard counted all seven as fixed. Today's
re-audit checked each against the code as it stands
([audit file](../../portfolio/quality/audits/2026-11-24-meta-ads-fatigue-analyzer.json)).

## What the fix closed

**2 of 7 defects closed, 2 partly, 3 open.** The two that closed were real fixes, each with a test:

- A tab-delimited export from a decimal-comma locale (the Excel/UTF-16 route) used to read
  `512,40` as 51,240. It now reads 512.40, and `1.234,50` as 1,234.50.
- The four fatigue thresholds that survived seeded mutations now have boundary tests. All four
  mutants are caught.

The standard path is still right. All 13 ads in the tool's sample export match a separate Python
recomputation from Meta's definitions (frequency is impressions over reach, link CTR is link clicks
over impressions) to four decimal places. The medians and the 79-click evidence threshold match too.

## What it did not fix

The only high-severity defect was still open. It was written into the README's "Known gaps"
instead of fixed.

Add a Day breakdown to an Ads Manager report and each row's Frequency is *that day's*: reach is
counted per day, so the figure sits around 1 to 1.5 however long the ad has run. The tool averaged
those values and opened every fatigue signal only at frequency 3. So the check a media buyer
actually runs, the same ad's CTR falling day after day, could not fire on a real daily export.
On a 28-day test file where one ad's CTR fell from 2.0% to 0.9%, the ad showed "Frequency 1.2"
and no flag.

## The fix in this PR

On a daily export, a CTR fall of a quarter or more across the ad's own days now flags it without
the frequency gate, since that decline is the fatigue pattern itself. The reason also says the most
the period frequency can be. Period reach is at least the largest day's reach, so period frequency
is at most impressions over that day's reach. The new test fails on the old code (33 pass, 1 fail)
and passes now. Two mutants seeded in the new code are both caught.

The page also says now, as the README already did, that the column names were written from memory
of the export and have not been checked against a real Ads Manager file.

## Where it stands

**Not at the bar on arrival** (correctness 2, claims 2, verification 3). Scores record the state
before this PR's fix, so a later round decides whether it clears. The main gap left is the method:
ads are compared with one median pooled across prospecting and retargeting, so retargeting
(high frequency by design) dominates the flags, and CPM, the auction half of the diagnosis, is not
computed.

The pattern is the one [reflection 3](../../portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md)
describes. A fix PR listed on an audit is not evidence that the audit's defects were fixed. Here
the PR documented the worst one and the scoreboard counted it closed.
