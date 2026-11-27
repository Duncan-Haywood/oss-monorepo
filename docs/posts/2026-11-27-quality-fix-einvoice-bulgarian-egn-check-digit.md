---
title: "Quality fix: a Bulgarian VAT check digit no test was guarding"
seo_title: "Bulgarian 10-digit VAT number (EGN) check digit: the remainder-10 rule"
date: 2026-11-27
tags: [quality-audit, einvoice-preflight, for-customers, e-invoicing, vat]
description: "When the EGN weighted sum leaves 10, the check digit is 0. Our e-invoice pre-check had it right, but changing the rule left every test green. Now a test fails."
---

Bulgarian VAT numbers come in two lengths. A 10-digit one is usually a
person's EGN (civil number). Its check digit is the first nine digits
weighted 2, 4, 8, 5, 10, 9, 7, 3, 6, summed and taken modulo 11. When
that remainder is 10, the check digit is **0**. A tool that gets this
wrong either rejects real numbers or accepts typos on about one number
in eleven.

The [E-invoice Preflight](../../ventures/einvoice-preflight/) check
(`vat.mjs`, `bgTenDigitOk`) had the rule right. The quality audit of
2026-11-19 ([audit file](../../portfolio/quality/audits/2026-11-19-einvoice-preflight.json),
defect 3) found that no test noticed if the rule changed. PR #18913 added
remainder-10 cases for 9-digit Bulgarian numbers and Czech numbers. When
we re-ran the seeded bug today (map remainder 10 to 1 instead of 0), it
still passed all 2,839 tests: none of the new cases was a 10-digit EGN.

**The fix.** `vat.test.mjs` now includes `BG6003050840`. Its weighted sum
leaves 10, its check digit is 0, and neither of Bulgaria's other two
10-digit rules accepts a 0 or a 1 for it. python-stdnum's `bg.vat`
accepts it and rejects `BG6003050841`, and the test checks both. With
the seeded bug in place, the test now fails.

**Also in this PR.** The page's "What this checks" section said it ran
"the same local rules as the CLI". It doesn't: Norway and Switzerland
VAT, PDF envelope checks and the profile options run only in the page
and the Node API. That paragraph now points to the note further down the
page, which lists the measured differences
(`eval/page-cli-parity-2026-11-25.md`). The audit file now records which
PRs closed its other defects. The BR-CO-17 one-unit tolerance (defect 2)
landed in PR #18913, and the CI install of the official-rules
dependencies (defect 4) landed in PR #18785. Defects 0, 5, 6 and 7 are
either already recorded as fixed or still open. A later re-audit checks
all of them.

This is a pre-check, not a legal validity test of a VAT number. VIES or
the Bulgarian NRA register is the authority on whether a number is
registered.
