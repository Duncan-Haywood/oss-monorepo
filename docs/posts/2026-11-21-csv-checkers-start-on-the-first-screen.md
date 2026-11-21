---
title: "Twenty of twenty-nine CSV checkers now start on a phone's first screen"
seo_title: "Folding long tool intros so the file picker is on a phone's first screen"
date: 2026-11-21
tags: [polish, design, mobile]
description: "The 29 CSV import checkers opened with a 66 to 96 word intro, and on a 390 px phone none showed its file picker without scrolling. Folding the list of checks brought 20 of them onto the first screen."
---

This site has 29 CSV import checkers: Shopify, Klaviyo, Mailchimp, Xero,
QuickBooks, Salesforce, the IRS's IRIS 1099 upload and more. People reach
them from a search like *"why did my Klaviyo import skip rows"*, usually on a
phone, with a file they want to check now.

Each page opened the same way: a headline, then one long sentence of 66 to 96
words listing everything the checker looks for (invalid and duplicate emails,
phone numbers that are not E.164, zips that lost their leading zero, and so
on), then the privacy and independence notes. The list is useful. But on a
390 × 844 phone it pushed the file picker below the first screen on **all 29
pages** (median 920 px from the top of the page).

The change keeps the sentence that says what the tool does ("Paste or drop
your Klaviyo profile CSV and get every problem with its line number before you
import. Then apply the safe fixes and download a cleaned CSV with every change
listed.") and moves the list into a **What it checks** panel that opens on a
tap. The text is still in the page, so search engines and assistants still
read it. The privacy note and the marketing-consent note stay visible.

Measured in Chromium, before and after, counting a field as on screen when at
least 16 px of it shows:

| Screen | Field on first screen, before | After | Median field top, before | After |
|---|---:|---:|---:|---:|
| 360 × 780 | 0 / 29 | 7 / 29 | 986 px | 810 px |
| 390 × 844 | 0 / 29 | 20 / 29 | 920 px | 775 px |
| 1280 × 844 | 29 / 29 | 29 / 29 | 546 px | 536 px |

Nine pages still put the field below a 390 px screen. Six of them carry two
notes under the intro (four have a 65 to 68 word note on marketing consent), and
that note should stay where a reader sees it before importing a mailing
list. They are the next thing to look at, along with the 1099 vendor
checker, whose own card opens with a long explanation.

The numbers came from a new script, `platform/pages/venture-fold.mjs`. It
measures where the first tool card and the first form field start on any set
of product pages, so the next family of pages can be measured without
writing the probe again.
