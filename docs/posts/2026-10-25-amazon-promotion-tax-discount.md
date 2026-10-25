---
title: "An Amazon promotion's tax discount is tax, not a refund"
date: 2026-10-25
description: "A small fix to ai-bookkeeper's Amazon settlement reader: Promotion/TaxDiscount rows now go to sales tax payable instead of refunds."
tags: [ai-bookkeeper, amazon, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits an Amazon settlement
report into sales, refunds, tax, ads and fees. Every `Promotion` row was booked
as a refund or discount, including the line that returns the tax on a
discounted item. That line is a reduction in tax collected, so booking it as a
refund overstated the discount and left sales tax payable too high by the same
amount.

`Promotion` rows whose description mentions tax now go to sales tax payable.
One new test covers it. The Amazon reference pages could not be fetched from
the build sandbox, so this follows the amount-description names in the repo's
fixture; no real settlement file has been tried.
