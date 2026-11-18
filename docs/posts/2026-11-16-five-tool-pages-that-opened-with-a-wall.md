---
title: "Five tool pages opened with a 120-to-180-word paragraph. Now none can."
seo_title: "Shorter tool intros: five ledes cut, and a 120-word check"
date: 2026-11-16
tags: [polish, site-build, where-to-sell-calculator, ada-title-ii-evidence, import-landed-cost-calculator, s3-bucket-exposure-check, lomb-scargle-periodogram]
description: "The paragraph under a tool's headline is what a visitor reads first. Five ran past 120 words. Cut to 44 to 106, and a test now stops any page going over 120."
---

The paragraph under a tool's headline is the first thing a visitor reads. It is also what a search snippet or an AI assistant quotes. On five of the 1,358 tool pages here, it ran past 120 words. The [Where to Sell Calculator](/where-to-sell-calculator/) led with 179 words in one paragraph. On a phone that was 552 px of text, and the first input sat 1,391 px down the page, about one and a half screens of reading before you could type a price.

All five had the same shape. A sentence or two said what the tool does. Then every cross-link and caveat anyone had added since got appended to that paragraph: "See how this differs from…", "Formatting a Shopify scan instead?", "Compare this against a spreadsheet…". Each addition made sense when it went in. Together they buried the opening.

## What changed

Each lede now says what you put in, what you get back, and anything you must know before you use the tool. For example, the [S3 Bucket Exposure Checker](/s3-bucket-exposure-check/) never fetches object contents and should only be run on a bucket you own. The rest moved below the lede: a short list of related tools, or a "What else the comparison counts" fold. No link was dropped and no claim was added.

| page | words before | after | first input on a phone |
|---|---|---|---|
| [Where to Sell Calculator](/where-to-sell-calculator/) | 179 | 78 | 1,391 → 849 px |
| [ADA Title II evidence record](/ada-title-ii-evidence/) | 154 | 44 | 949 → 830 px |
| [Import landed cost](/import-landed-cost-calculator/) | 134 | 59 | 1,052 → 1,007 px |
| [S3 Bucket Exposure Checker](/s3-bucket-exposure-check/) | 128 | 84 | 829 → 762 px |
| [Lomb-Scargle periodogram](/lomb-scargle-periodogram/) | 121 | 106 | 1,034 → 1,009 px |

One result went the other way. On a wide screen the ADA page's input moved 26 px down, because four list items take more height than the same words packed into one wide paragraph. I kept the change anyway: the opening now reads in one look, and the four links can be scanned.

## Keeping it fixed

A new check, `platform/pages/hero-lede.mjs`, counts the words in that first paragraph on every tool page. Its test fails the site build's test suite if any page goes past 120. Seventy-two pages still sit between 91 and 120 words, so the next step is to trim those and lower the limit to 100.
