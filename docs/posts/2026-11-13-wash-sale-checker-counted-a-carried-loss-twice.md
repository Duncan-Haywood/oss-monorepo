---
title: "Our wash-sale checker put a carried-over loss on the wrong shares, and an invariant found a second bug"
seo_title: "Two wash-sale basis carryover bugs, and the test that found them"
date: 2026-11-13
tags: [ventures, wash-sale-checker, redteam, testing]
description: "Two basis bugs in the free wash-sale checker that overstated a later loss, how they were found, and the conservation test that now guards the class."
---

The [wash-sale checker](https://marisstella.app/wash-sale-checker/) reads a
broker trade list and works out, for each loss sale, how much of the loss
the wash-sale rule (IRC 1091) disallows and which replacement shares take the
disallowed amount into their basis. A red-team run today found that the
second half of that, the basis carryover, could be wrong in two ways. Both
made a *later* sale's loss look larger than it was. Both are fixed.

**Bug 1: the carried loss was spread over the wrong share count.** Buy 30
shares at $100, sell them at $90 (a $300 loss), then buy 100 shares at $90
a week later. Thirty of the 100 new shares are replacement shares, so the $300
moves onto them: $10 a share on 30 shares. The checker stored that as "$10 a
share" on the whole 100-share purchase. When all 100 were later sold at $90 it
added $10 to every one of them, a $1,000 adjustment where $300 was right, and
reported a $1,000 loss on a position that had lost $300 in total. The fix keeps
each carried amount with the shares it belongs to (30 shares at $10) and spends
it only when those shares are sold.

**Bug 2: the same shares could carry two losses.** Buy 20, sell 10 at a loss.
The 10 still held are replacement shares and carry that loss. Sell 5 more at a
loss five days later: the old code treated those last 5 shares as available to
replace the second sale too, so they ended up carrying both losses. Shares that
already carry a wash loss are no longer offered as replacements for another
sale.

**How the second one turned up.** Three hand-written cases fixed the first bug
and passed. The test that found the second was a property, not a case: for any
trade list that ends with no shares held, every dollar of cost must show up
exactly once, so reported gains plus the deferred (code W) adjustments must
equal total proceeds minus total cost. The suite now generates 300 random
taxable trade lists and checks that equality on each. Its first version passed
on the buggy code because the random generator alternated buy and sell (the low
bit of a linear congruential generator flips every step), so only one of 300
lists had a wash at all. Taking the high bits fixed that, and the property then
failed on both the old code and the first fix.

What this means for anyone who used the checker: a result is affected only when
a replacement purchase was larger than the sale it replaced, or when two loss
sales fell within 30 days of the same purchase, *and* you later sold those
replacement shares. The disallowed amount on the first sale was always right;
the basis on the later sale was too high. Re-run the list to get the corrected
figures. As before, the checker is a planning aid, not tax advice; your
broker's 1099-B and a tax professional are the record.

The red-team run also seeded 16 faults into this checker and the UCR fee
calculator: the existing tests caught 12, two were judged harmless, and the
other two now have tests.
