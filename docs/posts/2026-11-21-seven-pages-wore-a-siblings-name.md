---
title: "Seven tool pages wore a sibling's name, and 25 hid their tool below the fold"
seo_title: "Copy-paste leftovers in tool page eyebrows, and folded phone intros"
date: 2026-11-21
tags: [polish, design, seo, testing]
description: "The Ko-fi tool's first line said PATREON; six more pages had the same leftover. And 25 journal tools hid the tool below a phone's first screen."
---

The first line on the Ko-fi payout tool, the small capitals above the
headline, read **PATREON PAYOUT TO JOURNAL**. The page was built from the
Patreon one and the eyebrow never changed. A visitor who searched for a Ko-fi
tool would see the wrong product name before anything else.

It was not alone. A script that compares each page's eyebrow with the names
of the other 1,400 tools found seven:

| Page | Its eyebrow said |
|---|---|
| Ko-fi payout to journal | PATREON PAYOUT TO JOURNAL |
| Buy Me a Coffee payout to journal | PATREON PAYOUT TO JOURNAL |
| Teachable payout to journal | PATREON PAYOUT TO JOURNAL |
| Fiverr earnings to journal | UPWORK EARNINGS TO JOURNAL |
| Shopify payout to journal | STRIPE PAYOUT TO JOURNAL |
| Phone repair shop profit calculator | SHOE REPAIR SHOP PROFIT CALCULATOR |
| Teachers Pay Teachers earnings analyzer | FIVERR EARNINGS FEE ANALYZER |

The titles, headlines, share titles, `llms.txt` and READMEs were all right
(the same script checked them). Only the eyebrow had been missed. Two of these
pages' siblings already had a test of their own that said "this page must not
say FIVERR" or "must not say PATREON PAYOUT". Those caught the one page they
were written for and nothing else. The new check,
`platform/pages/eyebrow-own-name.test.mjs`, reads every venture page and fails
when an eyebrow's words are exactly another tool's slug. On the old pages it
fails on these seven and nothing else.

## The tool was below the fold

The same look found a bigger problem on the same pages. On a 390 px phone
(an iPhone 14's width), 378 of the 1,411 tool pages put their first input
below the first screen. The journal tools were among the worst: one paragraph
of 62 to 100 words, about half of it in bold, ran to 9 to 15 lines before the
tool. On the Ko-fi page the first input sat at 1,214 px on an 844 px screen.

The 25 `*-to-journal` pages now take the pattern the flagships use. The
visible lede is the first sentence, which says what to upload and where to
find it ("Paste or drop your transactions CSV from Ko-fi (Dashboard >
Transactions > Download CSV)."). The rest sits in a fold, "What it books and
checks", that opens without JavaScript. The privacy and independence note,
and the warning that the file layouts were read from public help pages
rather than real exports, stay visible. Nothing in the title, headline or
structured data changed, and the folded text is still in the HTML.

Measured with Chromium, before and after, over the 25 pages:

| Screen | First card on the first screen | Median first-card top | First input on the first screen |
|---|---:|---:|---:|
| 390×844 | 10 → 25 | 842 → 639 px | 0 → 7 |
| 360×780 | 0 → 24 | 895 → 670 px | 0 → 0 |
| 1280×900 | 25 → 25 | 447 → 415 px | 25 → 25 |

The input itself still sits below a note on most of them; the card heading
("1. Your Ko-fi transactions") is now what a phone visitor sees. A second
test, `platform/pages/hero-fold.test.mjs`, holds any venture page with a fold
to a lede of at most 50 words, the same limit the flagships have.

The other 353 pages with the tool below the fold are the next run's list.
