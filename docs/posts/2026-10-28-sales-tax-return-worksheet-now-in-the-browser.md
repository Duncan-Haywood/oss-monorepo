---
title: "The sales tax return worksheet now runs in the browser, not just the command line"
date: 2026-10-28
description: "ai-bookkeeper's per-jurisdiction sales tax return worksheet, with due dates, rate checks and vendor discounts, is now a card on the page."
tags: [ai-bookkeeper, sales-tax, small-business]
---

# The sales tax return worksheet now runs in the browser

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

ai-bookkeeper's `salestax return` command splits the tax on your invoices by
jurisdiction and filing period ("CA state", "LA county" in the tax line's
description), checks the rate you actually collected against the one you expect,
applies a vendor discount such as Illinois's 1.75% capped at $1,000 a month, and
gives the due date. Until now only people who used the command line could see it.

It is now a block under the page's sales tax table, shown once any invoice carries
a tax line. Pick the filing frequency and a state (which sets the due day and the
state's filing note), optionally add expected rates (`CA state=7.25`) and discounts
(`IL state=1.75,1000/mo`), and the table updates.

With two made-up invoices (100.00 and 200.00 of goods, 6% California state tax and
1.00 of county tax on the first), the first quarter shows CA state taxable sales of
300.00, tax 18.00 at 6.00%, LA county 1.00, due 2026-04-20, 19.00 owed. Expecting
7.25% for "CA state" adds a warning that 6.00% was collected. A typo like
`CA state=abc` is refused with a message instead of printing NaN.

Checked in headless Chromium (`eval/browser-salestax-return.mjs`, five checks).
Everything runs in your browser; nothing is sent anywhere.
