---
title: "The eBay calculator's first box was 1,940 pixels down on a phone"
seo_title: "eBay, Etsy and Reverb fee calculators: the input before the links"
date: 2026-11-13
tags: [design, mobile, seo, open-source]
description: "Our marketplace fee calculators opened with a paragraph naming every comparison and guide, so the first input sat two screens down on a phone. Now about one."
---

Someone who searches "eBay fee calculator" on a phone wants to type a price. On our
[eBay fee and profit calculator](/ebay-fee-calculator/) the first box to type in was
1,940 pixels down the page, more than two screens on a 390-pixel-wide phone. Above it was the
answer to the question (the 13.6% final value fee and the $0.40 order fee, with eBay's help page as
the source) and then one sentence that named all 24 comparisons further down the page: "whether a partial
refund still beats taking that return, whether Authenticity Guarantee still pays after the hub
label, whether local pickup still beats the label ...". The [Etsy](/etsy-profit-calculator/) and
[Reverb](/reverb-fee-calculator/) calculators had the same shape, with the guide pages' links
packed into one paragraph.

That paragraph was written for a good reason: each of those comparisons and guides is real, and
linking to them is how a reader (and a search engine) finds them. It just doesn't need to be
the first thing on the page.

**How common is it?** We loaded all 1,346 tool pages at phone width and recorded how far down the
first input sits. The median is 750 pixels, within the first screen. The eBay page was among the
worst real calculators, and Etsy and Reverb were both at 1,451.

**What changed.** The intro now says what the tool does in one sentence. Under it, Etsy and Reverb
have a row of short jump links (Etsy Plus, Offsite Ads, Shipping labels ...). eBay has a closed
"Jump to one of the 24 comparisons below" disclosure, because 24 chips would be a wall of their
own. The guide links moved, all of them, to a "Questions this answers" list just above the FAQ.

| first input, 390 px phone | before | after |
|---|---|---|
| eBay | 1,940 px | 884 px |
| Etsy | 1,451 px | 949 px |
| Reverb | 1,451 px | 973 px |

Six other tools still have a header paragraph with more than eight links. A new test lists them
with today's counts. They can lose links but not gain any, and no other tool can add a paragraph
like that. Measurements and screenshots are in the
[polish report](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-13-intro-walls.md).
