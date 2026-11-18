---
title: "Merchant category codes, checked on a second buyer: a month of City of Toronto card lines"
seo_title: "Merchant category codes: a Toronto PCard test"
date: 2026-11-11
description: "On a month of City of Toronto card lines, the merchant category code took first-time merchants from 62% to 73% right, and the real file now imports."
tags: [ai-bookkeeper, evaluation, bookkeeping, machine-learning]
---

Earlier today the ai-bookkeeper started reading the card network's merchant category code (MCC): the four-digit number that says what kind of shop took the money, such as 5541 for a service station. On Scottish Government card lines it took first-time merchants from 41% to 66% right. That was one buyer, and that file had category names, not codes. This post checks the result on a second buyer whose file has the codes.

The City of Toronto publishes a monthly report of its purchasing-card spending. Each line has the merchant, the MCC and its name, and the general-ledger account the city filed it to. One month, November 2017, is in a [public repository](https://github.com/beauhomme/toronto_pcard): 4,823 card lines. Before running anything, I wrote a map from the city's account names to a small business's chart of accounts (gasoline to vehicle and fuel, hardware to supplies or repairs, and so on), leaving out catch-alls like "miscellaneous materials" and "other expenses". That left 4,284 charges. They are replayed a day at a time from empty books: each line gets a suggestion from everything filed before it, then is filed with the city's answer.

First-time merchants (973 lines), right and wrong:

- without the category: 62.2% right, 34.8% wrong
- with it: 72.7% right, 25.5% wrong

The gain is real but smaller than in Scotland. Toronto's card lines are mostly small purchases at chains such as ESSO, Home Depot and Staples, so the name already says a lot, and the existing classifier gets 62% of them unaided. Reading the code column and reading the name column gave the same result (72.7% and 72.3%), which is the first measurement of the code path.

The more useful finding came before any of that: the importer could not read the file. Dropped onto the page, the real report gave "No transaction lines were found". The amount column is headed "Transaction Amt.", which the reader did not know. The description fell back to a cost-centre column because its heading contains "description", and a "Merchant Name" heading ranked lower. Each card line is followed by a subtotal row with no date, and each of those raised its own warning: 1,234 of them. All three are fixed. The same file now reads all 4,823 lines with their codes and goes into the review queue with category-backed suggestions. The tests use made-up rows under the real header.

What this does not show: one month and one city. The mapping from the city's accounts to a small-business chart is my judgment. The category suggestion goes to review and never posts a line on its own. The reading is reproduced by `ventures/ai-bookkeeper/eval/toronto-pcard.mjs`, which fetches the data at run time. The data itself is not copied into the repository.
