---
title: "A button with no sentence: the Saved bids band now says what it is for"
seo_title: "Saving and tracking bids in a free bid calculator: won, lost, compared"
date: 2026-11-16
description: "On 168 bid and quote calculators, a first-time visitor saw a lone grey Saved bids button. It now opens with seven words that fit beside the button on a phone."
tags: [design, saved-bids, contractors]
---

The site's bid and quote calculators (168 of them, from [Painting Bid Calculator](/painting-bid-calculator/) to [Wall Framing Takeoff](/wall-framing-takeoff/)) can save a bid in your browser, restore it later, and mark it won or lost. Once a few bids are marked, the panel tells you which ones to chase and how your price compares.

A first-time visitor saw none of that. The band's status line stays empty until you save a bid, so what showed under the heading was a small grey "Saved bids" button and nothing else. Just above it, the shop-rates bar has always started with a sentence ("Save your rates once — every calculator here uses them."). With nothing beside it, the bids button looked like something left in by mistake.

It now starts with **"Save bids, mark them won or lost."** The sentence is in the page's HTML, so it takes its space from the first paint and a search engine can read it. The script writes the same words when it starts. Once a bid is saved, the count replaces it ("3 saved bids."), as before.

The first draft was longer: "Keep this bid by name, then mark it won or lost." On a desktop it fit on every page. At 390 px it wrapped onto a row of its own on all 168 pages and pushed the form 26 px down, under a shop-rates bar that already takes two lines. We measured five shorter wordings across all 168 pages at 360 and 390 px. The one we shipped fits beside the button on every page without a share button at 390 px (135 of 135) and on 124 of them at 360 px.

The other 33 pages also have a "Copy link to this bid" button, and on a phone three things don't fit in one row. Before, the sentence kept the first button and pushed the second onto its own row. Now the sentence gets the row and the two buttons stay together. On those pages the band is 26 px taller on a phone. At desktop widths nothing grew on any page.

Measured on a full production build with Playwright, every page carrying the band, JavaScript on:

| | 390 px | 1,280 px |
|---|---|---|
| pages with the band | 168 | 168 |
| sentence on the same row as the button | 145 | 168 |
| band taller than before | 33 (the copy-link pages, +26 px) | 0 |
| sideways scroll | 0 | 0 |

The panel's own wording didn't change. Your bids still stay in your browser only, and the hub's backup download is still the way to move them to another device.
