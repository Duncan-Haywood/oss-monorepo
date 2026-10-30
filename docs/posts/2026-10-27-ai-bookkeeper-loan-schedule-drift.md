---
title: "Why a lender's loan schedule can differ from yours by dollars"
date: 2026-10-27
description: "600 random loans through ai-bookkeeper's schedule: every invariant holds, and the last payment absorbs rounding drift that compounds on long, high-rate loans."
tags: [ai-bookkeeper, accounting, loans]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits each loan payment into interest and principal. A new property test runs 600 made-up loans ($1 to $900,000, 0 to 25%, 1 to 360 months) through the schedule. Principal always sums to the amount borrowed, the balance never rises or goes negative, and extra principal never adds interest or months. No bug found.

The test did show something worth knowing. The level payment is rounded to the cent, and each month's interest is too. Those errors compound, so the final payment absorbs them. On a $68,495 loan at 20% over 316 months the payment is $1,145.54 and the last one differs by $57.92. The drift is bounded by ((1+i)^n - 1)/i cents, where i is the monthly rate. On ordinary terms it is cents. On a long, high-rate loan it is dollars.

So if a lender's own table disagrees with the books by a few dollars at the end, check the terms before suspecting a typo. `loan check` takes the lender's table and shows where it diverges.
