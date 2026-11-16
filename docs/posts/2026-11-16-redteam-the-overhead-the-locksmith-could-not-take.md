---
title: "The overhead the locksmith page could not take: red-teaming the shared shop-rates bar"
seo_title: "Prefilling saved form values across tools: respect each page's own max"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, forms, contractors]
description: "24 faults seeded into the shop-rates bar and a CI lint, 22 caught. The hunt found a saved 150% overhead that opened the locksmith page on an error."
---

The shop-rates bar is the strip at the top of 105 trade bid calculators on
[marisstella.app](https://marisstella.app/). A contractor types their crew
wage, payroll burden, overhead and target margin once, saves them in their
own browser, and every other bid calculator opens with those numbers. Today's
red-team run aimed at it (`platform/pages/rates.mjs`), and at
`platform/ci/check_finite_thresholds.py`, the lint that stops a `--max-*`
flag from accepting `nan`.

## What the tests caught

Twelve faults went into each file; 22 of 24 were caught. The two that got
through:

- **A page cut off before `</body>`.** The injector refuses a page missing
  either body tag. Turning its `||` into `&&` let a truncated page through,
  which got the bar but not the script that drives it: a form that never
  loads or saves. No test had a page with one tag and not the other. Now one
  does.
- **The lint's exit code.** `main()` returning 2 instead of 1 still fails CI,
  but 2 conventionally means "usage error". A test now pins 1 for a finding.

## The real bug

The bar carries one ceiling per field for all 105 pages: overhead up to 500%,
burden up to 500%, margin under 100%. Thirteen inputs on nine pages set a
lower ceiling of their own. The
[locksmith bid calculator](https://marisstella.app/locksmith-bid-calculator/)
takes overhead up to 100%, and its calculator throws above that.

So a contractor who saved a 150% overhead on any other tool (a small shop
with heavy fixed costs can be there) and then opened the locksmith page got
the 150 written into the form, and the page opened on "Overhead rate must be
100 or less." instead of a price. Checked in Chromium on the locksmith page with the bar injected as the build does:
on `main`, the error; after the fix, the page keeps its own 15% and the bar
says "Overhead on direct cost is above what this tool accepts, so it keeps its
own." The saved 150 stays in storage for every tool that accepts it.

The fix reads each input's own `max` in the browser and uses the lower of
that and the shared ceiling, both when applying saved rates and when saving
from the form.

## The class, not the instance

That fix only sees a ceiling written on the input. The
[ice dam removal bid calculator](https://marisstella.app/ice-dam-removal-bid-calculator/)
caps overhead at 100% in its code but not on its input, so it had the same
bug with nothing on the page to read. It now has `max="100"`, and a new test
walks every page that takes the bar: if a calculator caps a carried rate in
code, its input must say so. It failed on ice dam removal alone, and passes now.
