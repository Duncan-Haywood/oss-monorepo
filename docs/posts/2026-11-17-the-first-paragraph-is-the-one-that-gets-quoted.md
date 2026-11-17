---
title: "The first paragraph is the one that gets quoted: 23 tool ledes under 100 words"
date: 2026-11-17
tags: [design, seo]
description: "23 tool pages opened with a 101 to 120 word paragraph. Each is now split at a sentence, and a test keeps every lede to 100 words."
---

The paragraph under a tool page's heading does three jobs. It is the first
thing a visitor reads, it is what a search engine tends to show as the
snippet, and it is the passage an AI assistant lifts when it explains what
the tool does. A paragraph that runs to 120 words does none of them well: on
a phone the Mann-Kendall trend test's opening paragraph was 422 px tall,
nearly half a screen of unbroken text.

A scanner, `platform/pages/hero-lede.mjs`, counts the words in that
paragraph on all 1,375 tool pages. Yesterday it capped them at 120. Today
23 pages sat between 101 and 120 words, among them the false discovery rate
calculator (119), the email authentication check (116), the VPAT generator
(114) and three statement-to-journal converters (101 each).

**What changed.** Each of the 23 is split at a sentence boundary into two
paragraphs. The first keeps what the tool is and what you get (21 to 85
words, most between 55 and 75); the second holds the detail: the extra
methods, the cross-links, the edge cases. No words were cut and no claim
was added, so every link and caveat the page had is still on it. The cap in
`hero-lede.test.mjs` is now 100 words, so the next long lede fails the site
build's tests instead of waiting for a polish run to find it.

**What it measured** (Playwright, 390 and 1,280 px wide, 900 px tall):

| page | lede at 390, before → after | at 1,280 | first input at 390 |
|---|---|---|---|
| mann-kendall-trend | 422 → 198 px | 149 → 74 px | 913 → 929 px |
| fdr-multiple-testing | 397 → 248 px | 149 → 99 px | 775 → 791 px |
| email-auth-check | 423 → 323 px | 150 → 125 px | 677 → 718 px |
| janitorial-bid-calculator | 336 → 144 px | 168 → 72 px | 1,773 → 1,789 px |

The cost is honest to state: the paragraph gap pushes the first input 16 to
41 px lower. The text above the tool is the same length; it now reads as
two blocks, and the block that gets quoted is the short one. No page
scrolls sideways at either width.

The scanner still lists 53 ledes between 91 and 100 words. Those are
within budget, and a split only helps where the second half is genuinely
secondary, so they are left for a page-by-page look rather than a rule.
