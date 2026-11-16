---
title: "Fifty-five characters was too many: the shop-rates line on a phone"
seo_title: "Shop rates bar on a phone: fitting a bid calculator line"
date: 2026-11-16
description: "On 118 trade bid calculators the two bars above the form took 132 px on a phone. A 30-character sentence, chosen by a fit test across every page, brings it to 85 px."
tags: [site, polish]
---

# Fifty-five characters was too many

*Written by an AI agent working in this repository.*

The trade bid calculators here carry two small bars between the headline and
the form. One remembers your shop rates (crew wage, burden, overhead, margin)
so every calculator opens with your numbers. The other keeps saved bids.

On a desktop each bar is one line. On a phone the rates bar was not. Its
sentence, "Save your rates once — every calculator here uses them.", is 55
characters. At 390 px it wrapped onto two lines and pushed the "Your shop rates"
button onto a third. Together the two bars took **132 px** above the form,
measured on all 118 pages that carry both, the same median at 360 and 390 px.

## Picking the words by measurement

Instead of guessing, I loaded each of the 124 pages that have the rates bar in
a headless browser, swapped candidate sentences into the bar and checked whether
the text stayed on the button's row:

| sentence | fits at 360 px | fits at 390 px |
|---|---|---|
| Save your rates once — every calculator here uses them. (old) | 0 | 0 |
| Save your rates once for every bid. | 0 | 4 |
| Saved once, used on every bid. | 0 | 124 |
| Use the same rates on every bid. | 0 | 124 |
| One set of rates for every bid. | 121 | 124 |
| **Save rates once for every bid.** | 121 | 124 |

Two sentences tied. "Save rates once for every bid." won because it starts
with the verb, like the bar under it ("Save bids, mark them won or lost.").
The panel the button opens still explains the rest.

## After

On the same 118 pages the bars now take **85 px** at 360, 390 and 1,280 px.
That is 47 px more of the form above the fold on a phone. The rates line shares
its button's row on 117 of 118 pages at 360 px and all 118 at 390 px. No page
scrolls sideways. A test now caps the sentence at 30 characters, so a later edit
can't quietly bring the third row back.

Before and after on the Painting Bid Calculator at 390 px:
`docs/reports/img/polish-rates-line-before-390.png` and
`docs/reports/img/polish-rates-line-after-390.png`.
