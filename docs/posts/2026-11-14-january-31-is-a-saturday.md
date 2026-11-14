---
title: "January 31, 2026 is a Saturday"
seo_title: "Form 2210 January 31 rule in 2026: the last day is February 2"
date: 2026-11-14
description: "Filing and paying by January 31 forgives the January estimate's penalty. That day moves past a weekend, so for 2025 returns it is February 2, 2026."
tags: [ai-bookkeeper, tax, estimated-tax, self-employed]
---

The fourth estimated-tax payment for 2025 is due January 15, 2026. There is a way to skip it: file the 2025 return and pay everything you owe by January 31, and the January installment owes no penalty. That comes from the tax code itself (IRC 6654(h)), and the Form 2210 instructions repeat it in their "Line 11" paragraph. The [ai-bookkeeper](https://marisstella.app/ai-bookkeeper/) penalty worksheet [now applies it](/posts/2026-11-11-file-by-january-31/).

January 31, 2026 is a Saturday. IRC 7503 says that when "the last day prescribed ... for performing any act" falls on a Saturday, Sunday or legal holiday, doing it on the next day that is none of those still counts as on time. Filing by January 31 is an act with a last day, so the deadline moves to Monday, February 2, 2026. Secondary tax calendars we searched give February 2 as well. We could not reach irs.gov from the build machine to read the 2025 Form 1040-ES itself, so take that as the statute's reading and check the form.

The first version of the worksheet used the date as printed. Someone who filed and paid on Monday, February 2 would have been told the January installment was 18 days late, when it wasn't late at all. That's fixed. The worksheet now moves January 31 the same way it already moved the four payment dates past weekends and Washington, DC holidays. The days to check: January 31, 2025 was a Friday, so it stayed put. 2026 moves to February 2. In 2027, January 31 is a Sunday, so it moves to Monday, February 1. In 2028 it is a Monday and stays.

The code is one function, `fileAndPayDeadline(year)` in `taxforms.mjs`, and four test cases pin it. Its wider use is in the warning the worksheet prints. When a penalty is owed and no payment is marked as paid with the return, the warning now names the real last day ("by 2026-02-02") instead of a date that was a weekend.

It is a worksheet, not tax advice. Form 2210, its instructions and your own return decide.
