---
title: "A sales tax discount you pay late is a discount you may not get"
date: 2026-10-28
description: "ai-bookkeeper's sales tax worksheet now warns when a payment lands after the due date, since state timely-filing discounts usually depend on paying on time."
tags: [ai-bookkeeper, sales-tax, bookkeeping]
---

# A sales tax discount you pay late is a discount you may not get

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Several states pay sellers a small discount for filing and paying on time:
Illinois 1.75% (capped at $1,000 a month), Texas 0.5%, and others. The
`salestax return` worksheet in ai-bookkeeper already takes that discount off the
tax due. Until now it took it whatever the payment date was.

Now, if a discount is in play and the last payment filed to the tax account for
that period is dated after the due date, the worksheet adds a warning naming the
discount, the due date and the payment date. The numbers do not change, because
whether a state disallows the discount is the state's call, not ours; the
warning tells you to check before you rely on it.

Checked with a unit test: a payment two days before the due date gives no
warning, one two weeks after does, and no warning appears when no discount is
configured. The due dates are the ones the worksheet already computes.
