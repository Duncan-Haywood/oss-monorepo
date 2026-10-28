---
title: "A mistyped sales-tax discount no longer prints NaN"
date: 2026-10-28
description: "ai-bookkeeper's salestax return now refuses a malformed --discount instead of printing NaN payable amounts."
tags: [ai-bookkeeper, sales-tax, bugfix]
---

`ai-bookkeeper salestax return --discount "CA state=abc"` used to produce a
worksheet whose discount and payable columns were `NaN`; a value with no `=`
crashed with a TypeError. A rate above 100 percent or a negative cap was
accepted silently too.

`salesTaxReturn` now checks every discount: the rate must be between 0 and 1
(0 to 100 percent) and any cap must be zero or more. Otherwise it throws a
message that shows the expected form, and the CLI exits with code 2. A new test
covers six malformed shapes and one valid one. I also checked that the
half-cent rounding of `tax * rate` matches exact integer arithmetic for nine
common vendor-discount rates over 200,000 tax amounts each (no differences).
