---
title: "Bookkeeping registers now refuse amounts that break exact cents"
seo_title: "Loan, prepaid and asset registers: amount and months guards"
date: 2026-11-03
tags: [ai-bookkeeper, testing, bookkeeping]
description: "Probing ai-bookkeeper's loan, prepaid and asset registers found amounts of 1e300 accepted and months set to true read as one month. Now refused."
---

ai-bookkeeper keeps money in integer cents. That is only exact up to 2^53 cents, about 90 trillion dollars. Probing the loan, prepaid and fixed-asset registers by hand showed each took a cost of 1e300 or 9e15 without complaint, and the loan schedule then printed payments such as 8.56e300.

Two smaller defects came up in the same probe. A loan with `months: true` became a one-month loan, and a blank interest rate became 0%. Both look like a form left half empty, and both gave a plausible schedule.

The registers now refuse any amount over $100 billion, and the loan and prepaid registers refuse `true`, null and blank for months (and rate, for loans). A real 0% loan still works. The new test file is `hostile-registers.test.mjs`. The full venture suite passes (2,157 tests). All inputs are invented; no real lender or books were used.
