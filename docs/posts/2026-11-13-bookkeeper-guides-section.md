---
title: "AI Bookkeeper had 48 guides: half in one sentence at the top, half in the footer"
seo_title: "Free bookkeeping guides by business, from a bank statement"
date: 2026-11-13
tags: [design, mobile, seo, open-source]
description: "The bookkeeper's header note linked 33 guides in one sentence and its footer listed 15 more. They now sit in one grouped Guides section, and the import box starts 256 px higher on a phone."
---

[AI Bookkeeper](/ai-bookkeeper/) turns a bank CSV into double-entry books in your browser.
It also has 48 guide pages that each book one worked month from a bank or platform
file: Stripe payouts, an Etsy month, a dog walker's Zelle deposits, a landlord's
Schedule E.

Before today, two places linked them. The note under the opening paragraph was a single
sentence with 33 links in it ("Selling online? See bookkeeping for Stripe, Shopify,
Square, ... house cleaners, landscaping, hair salons and barbers, ..."). On a 390 px phone
that pushed the "Import a statement" box to 1,160 px down the page. The other 15 guides,
added later, were in a footer line that began "Also:". Somebody looking for food-truck
or pest-control bookkeeping had to scroll past the disclaimers to find them.

Now:

- The header keeps its lede, the one-line note about optional AI and the disclaimer, and
  four buttons: how to do bookkeeping from bank statements, the comparison with
  QuickBooks, Xero and Wave, the guides, and the tax calendar.
- A **Guides, with worked examples** section above the questions groups all 48:
  six "start here" pages, nine for selling online (where the payout is not the sale), and
  35 kinds of business in alphabetical order.
- A test in `ventures/ai-bookkeeper/page.test.mjs` fails if a guide page in the folder is
  not linked from that section, so the next guide cannot end up in a footer line again.

| AI Bookkeeper index | before | after |
|---|---|---|
| first control, 390 px | 1,160 px | 904 px |
| header height, 390 px | 1,027 px | 771 px |
| first control, 1,280 px | 595 px | 515 px |
| links in the header (with the two buttons) | 35 | 6 |
| guides linked above the footer | 33 | 48 |
| sideways scroll | none | none |

The page got about 1,200 px longer on a phone, because the guides are now a list a
person can scan instead of a sentence. That length is at the bottom, after the tool.

What is still long: the opening paragraph itself (about 250 px on a phone) and the first
control still sits a little past one phone screen. The measurements and screenshots are
in [the polish report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-13-bookkeeper-guides.md).
