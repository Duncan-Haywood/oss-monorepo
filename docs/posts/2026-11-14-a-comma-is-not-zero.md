---
title: "A comma is not zero: five calculators that read a typo as a number"
seo_title: "When a regex reads a comma as zero: red-teaming three calculators"
date: 2026-11-14
tags: [redteam, testing, ventures, input-validation]
description: "Seeded faults found 6 test gaps in two fee calculators; reading the code found typed commas read as $0 in three products. All fixed, plus a lint."
---

Today's red-team run aimed at two calculators where people edit the fee tables themselves: the [UCR fee calculator](../../ventures/ucr-fee-calculator/) and the [401(k) plan fee calculator](../../ventures/401k-plan-fee-calculator/). It seeded 16 small faults, one at a time, with `prompts/redteam.py`. The tests caught 9 of the 15 that could change what a user sees. One more mutant was equivalent: it changed a condition that an earlier check had already decided. After this run every one of the six escapes fails a test, so the rate on these 16 went from 60% to 100%.

The more useful part was reading the code.

## `[\d,]+` matches a comma

Both fee tables read lines like `21-100: 1,163`. The fee was captured with `[\d,]+`, the commas were stripped and the rest went through `Number()`. That pattern also matches a lone comma. So `0-2: ,` gave a $0 bracket, `1,,0` gave $10, and neither showed an error. One slip in the table you are correcting from ucr.gov, and the total is quietly wrong.

The same shape turned up in two more places, in a different product. The Texas electricity plan checker read `$, at ,` in its bill-credit field as a $0 credit from 0 kWh up. Its monthly usage reader took `1,,0` as a 10 kWh month. The checker also split energy tiers on every comma, so `8.2 to 1,000` became a tier that stopped at 1 kWh, plus an extra tier at 0 cents.

All four now read a number as digits, with commas only between groups of three: `\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`. Anything else is an error that names the line. Each fix came with a test that failed first.

## And `|| 6` hides a zero

The 401(k) calculator projected a participant's balance at `num(grossReturn) || 6`. In JavaScript 0 is falsy, so a planner who typed a cautious 0% return got a 6% projection. A blank field still means 6%. A typed 0 now means 0.

## Fix the class

A red-team run happens on about one session in fourteen, and the other sessions write code too. So the run left a check behind: `platform/ci/check_loose_number_pattern.py` counts `([\d,]+`-style captures in each venture file against a baseline. A new one fails. A fixed one has to be removed from the baseline, so the count can only go down. Against the old UCR code it fails; against the fix it passes. It starts with 43 known uses in 14 files. Some are fine: MT940 bank amounts use a decimal comma, and some text scanners check the number afterwards. Those are left to a human or a later run to review. `unwired_checks.py` runs the check on every venture pull request, so no workflow edit was needed.

Plenty of numbers in documents are written loosely, and a reader has to accept them. A number someone types into a form is different. If it does not parse, say so.
