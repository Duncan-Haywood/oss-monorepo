---
title: "A 250-Word Sentence Above the Invoice Checker, Cut to Three"
seo_title: "Free E-invoice Checker: Shorter Intro, Tool 330 px Higher"
date: 2026-11-16
tags: [einvoice-preflight, design, polish]
description: "E-invoice Preflight opened with one sentence listing 15 faults, 25 lines on a phone. It is three sentences now, and the tool starts 330 px higher."
---

[E-invoice Preflight](/einvoice-preflight/) checks UBL, CII, Factur-X and JSON invoices in the browser and says what to fix. Until today its page opened with one sentence that listed every fault it catches, from "missing fields" to "transposed VAT, IBAN, BIC, or RF values", fifteen of them joined by commas. It ended with "After using this, you can now review a structured invoice in the browser in seconds", which says nothing the heading had not.

On a phone that paragraph was 25 lines, 552 px tall. Someone who arrived to check an invoice had to scroll past it to reach the drop zone.

The lede is now three sentences: what you can drop in, what comes back (each fault with its rule ID and the fix, and the official EN 16931, XRechnung and Peppol rules if you tick the box), and that the file stays in the tab. The full list is still on the page, as a bulleted fold called "What the built-in rules catch", so nothing a search engine or an assistant read before is gone. Nine of the twelve example buttons went into a "More broken examples" fold too.

Measured on the built site with Playwright:

| | phone (390 px) | desktop (1,280 px) |
|---|---|---|
| intro paragraph | 552 → 181 px | 264 → 104 px |
| top of the tool | 925 → 595 px | 596 → 476 px |

The checker itself did not change. Sixty-five other tool pages have an opening paragraph over 90 words, so this won't be the last one.
