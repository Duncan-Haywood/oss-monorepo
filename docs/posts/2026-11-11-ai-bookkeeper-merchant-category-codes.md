---
title: "The card network already knows what kind of shop it was: merchant category codes on 14,000 government card lines"
seo_title: "Merchant category codes for bookkeeping"
date: 2026-11-11
description: "Reading the card network's merchant category took first-time merchants from 41% to 66% right on the Scottish Government's published card spending, held out. Most of the gain came from learning what each category meant in these books."
tags: [ai-bookkeeper, evaluation, bookkeeping, machine-learning]
---

A bookkeeping tool that learns from your corrections is good at payees it has seen and poor at the first line from a new one. A new merchant's name tells it very little. On a card line there is often one more field: the card network's merchant category code (MCC), a four-digit number such as 4121 (taxis) or 5812 (restaurants), or its name. Purchasing-card files and some bank exports carry it. The ai-bookkeeper now reads it.

The test data is the Scottish Government's monthly list of payment-card spending over £500, which [Open Data Scotland](https://github.com/OpenDataScotland/govspend.opendata.scot) collects into one file per month. Every line has the merchant, the network's category name, and the expense description staff filed it under: 13,998 lines from May 2016 to August 2026. 11,087 of them have a description that maps to a small-business chart of accounts (catering to meals, training courses to education, and so on). I wrote that mapping before the first run. The lines are replayed in date order, the way the import loop files them: each line gets a suggestion from everything filed before it, then is filed with the staff's answer. I made the design choices on 2016-2019 and then scored 2020-2026 once.

First-time merchants, 2020-2026 (1,923 lines), right and wrong out of all lines:

- without the category: 41.4% right, 43.3% wrong
- a fixed table from category to account: 52.4% right, 40.2% wrong
- the table, replaced by these books' own history of each category once it has three earlier lines with a majority: 66.0% right, 30.9% wrong

Across every line, not just first-time merchants, accuracy went from 72.4% to 79.3%.

The fixed table helps, but the larger gain is from the books' own history, and the reason is the useful finding. The code says what the merchant sells, not why the buyer bought it. In these books, 62 of 67 lines from "consulting, management and public relations" merchants in 2016-2019 were training courses or conferences, and 68 of 120 lines from "computer software stores" were training, against 41 that were software. A table written for a typical small business gets those wrong every time. Counting where each category went in your own books fixes them, with no rule written for this buyer.

What the result does not show: this is one buyer, a government, with its own list of expense types and only lines over £500. Mapping its descriptions onto a small business's chart is my judgment, and equipment counts as right whether it was filed as supplies or as a fixed asset. Files that carry the numeric code rather than the name are read the same way, but none was measured. The suggestion goes to review and never posts a line on its own.

The code is `ventures/ai-bookkeeper/mcc.mjs`, and the reading is reproduced by `eval/scotgov-card.mjs`. The data is fetched at run time and not copied into the repository.
