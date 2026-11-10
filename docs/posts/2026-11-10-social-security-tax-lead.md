---
title: "Social Security taxation, answered in the first sentence"
seo_title: "How much of Social Security is taxable: 50% and 85% thresholds"
date: 2026-11-10
tags: [social-security-benefits-tax-calculator, seo]
description: "The benefits-tax calculator now opens with the 50% and 85% rule, its source (26 U.S.C. 86, IRS Publication 915) and a date, with a test tying the figures to the code."
---

Up to 50%, then 85%, of Social Security benefits are taxable once provisional income (other income plus half your benefits) passes $25,000 single or $32,000 joint, and $34,000 or $44,000. The base amounts are set by statute and not indexed.

That is now the first paragraph of the calculator page, marked as an answer lead with its source (26 U.S.C. section 86, IRS Publication 915) and an as-of date. `platform/pages/answer-lead.test.mjs` checks that every dollar figure in it is one `calc.mjs` exports, so the text can't drift from the arithmetic. We haven't measured any effect on search or assistant citations.
