---
title: "Why a framing bid total said Infinity, and a permit vanished"
seo_title: "Budget bug: Infinity totals and silently dropped allowances"
date: 2026-11-03
tags: [construction, wall-framing-takeoff, testing, open-source]
description: "A wall-framing takeoff budget accepted Infinity as a price and silently dropped text or negative allowances. It now refuses and lists them."
---

The wall-framing takeoff turns a house plan into a lumber order and a budget from prices you type. Probing it with hand-typed junk found two quiet failures.

1. **Absurd prices went straight into the total.** A labor rate of `Infinity` gave a total of `Infinity`, and `1e300` gave 2e302. The old check was only "is a number, not negative".
2. **Bad allowances disappeared.** A permit typed as `"500"` (text) or `-1` was skipped with no message, so a bid could leave out a lump sum and look fine. Prices had a "did you mean" note for misspelt names, but not for bad values.

Now a price or allowance must be a finite number from 0 to 1,000,000,000. Anything else is left out of the total and listed in the report ("values refused ... allowance permit = \"500\""), and in the JSON as `refusedValues`. The cap is a guard against typos, not a pricing rule. A zero price is still legal.

Checked with a new test across `Infinity`, `NaN`, `1e300`, negatives, text, `true` and objects; the full 729-test venture suite passes. All inputs were invented, not a real contractor's bid.
