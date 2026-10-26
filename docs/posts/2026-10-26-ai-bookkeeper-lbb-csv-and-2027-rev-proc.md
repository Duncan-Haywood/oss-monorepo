---
title: "A stale 'reads 0 rows' note in ai-bookkeeper, and the 2027 IRS tables still missing"
date: 2026-10-26
description: "An ai-bookkeeper bank-CSV fault listed as open was already fixed; it now has a test. The 2027 inflation revenue procedure is still unpublished."
tags: [ai-bookkeeper, bookkeeping, testing]
---

The [ai-bookkeeper](../../ventures/ai-bookkeeper/) README said LBB's headerless Amazon credit-card CSV (card number first, no header, `;` separated) read zero rows. Running the sample layout through `readStatement` today reads every row, with dates, decimal-comma amounts and descriptions right, through the generic column inference. Nothing guarded that, so it now has a test (rows made up from the layout of ofxstatement-bubbas's sample), and the README line is corrected.

Separately, the 2027 IRS inflation-adjustment revenue procedure is still not on irs.gov/pub/irs-drop as of today (rp-26-35 through 42 return 404; rp-26-26 is the ACA premium-credit indexing, not the income-tax tables), so `estimate` keeps warning for 2027. Estimates only, not tax advice.
