---
title: "A Rocket Money export booked a firm's card spending as income"
seo_title: "Monarch and Rocket Money CSV exports to business books: two faults"
date: 2026-11-14
description: "Rocket Money writes spending as positive amounts, so four months of a firm's Amex charges imported as income. Monarch's tidy merchant names hid fuel."
tags: [ai-bookkeeper, bank-statements, evaluation, monarch, rocket-money]
---

When Mint shut down, most of its users went to Monarch or Rocket Money. Both apps let you download every transaction as a CSV, and people do try to turn those files into books for a side business. The ai-bookkeeper has read Mint-style files for weeks. Today it read one real export from each of the two newer apps, both found in public GitHub repositories. One is a small agency's American Express business card, exported from Rocket Money: 958 lines from March to June 2024. The other is one household's 2025 Monarch export: 1,581 lines across five accounts. I fetched both at run time and committed neither, because they hold names and account digits.

## The sign was backwards

Rocket Money writes money going out as a **positive** amount. A $123.91 FedEx charge is `123.91`. An airline refund is `-22.99`. That holds on checking accounts as well as cards, and two other projects' test files show the same thing.

The importer didn't know the layout. With no balance column and no "payment, thank you" row to go on, it read the amounts at face value. So 944 of the 958 lines, four months of the firm's card spending, came in as money received. Profit for those months would have been overstated by the whole card bill, and nothing on screen said so.

The layout now has a name (`rocket-money`). Signs are flipped, the import notes that they were, and each `Account Name` in the file goes to its own account, as Mint files already did.

## A tidy merchant name can hide what you bought

Monarch's file has two text columns. `Merchant` is Monarch's cleaned-up name and `Original Statement` is the bank's own text. The reader took the clean one. That sounds sensible until you see what the cleaning does: `KROGER FUEL #3532` and `KROGER #532 VIRGINIA` both become "Kroger", and `EXXON 7-ELEVEN` becomes "7-Eleven". Thirty fuel purchases were filed as meals because the word "fuel" was gone before the categorizer ever saw the line.

So the reader now takes the bank's text and falls back to the merchant name only when the statement is blank. I measured the same switch on the ten Mint exports from an earlier run, and there it would have made things slightly worse (wrong suggestions up about a point on the held-out files). Mint's cleaned names keep more than Monarch's do, so Mint stays as it was.

## The numbers

Each file was replayed as the import loop works. Each day's lines get suggestions from everything filed on earlier days, then they are filed with the app's own category. Only money out is scored, and only in categories that name one account. The category column is blanked first, so the categorizer never sees the answer.

| file | lines scored | right, before | right, after | wrong, before | wrong, after |
|---|---|---|---|---|---|
| Rocket Money, firm's Amex card | 710 | 93.2% | 94.1% | 5.5% | 5.1% |
| the same, payees seen for the first time | 205 | 79.0% | 81.0% | 17.6% | 16.1% |
| Monarch, household | 502 | 88.2% | 91.6% | 10.2% | 6.8% |
| the same, payees seen for the first time | 155 | 73.0% | 80.0% | 22.3% | 16.1% |

The Rocket Money "before" is the first reading once the signs were right, before any rule was written from the file. On the untouched code the only money-out lines in that file were 13 refunds, read backwards. On Monarch, the switch to the bank's text accounts for most of the gain (91.0% right, 6.8% wrong on its own). After the reading I added a handful of keywords: Hotels.com, Amex Travel, parking meters, auto washes, Texaco, gas utilities and liability insurance. I also taught the bank-category layer both apps' label names. Those additions are tuned on these files. Treat the "after" figures as an upper bound and the "before" as the estimate for a file nobody has looked at.

## Caveats

These labels come from consumer apps, and they're noisy. Rocket Money filed a Midjourney subscription under Dining & Drinks and a restaurant booking under Auto & Transport. It's one firm's card and one household. Convenience stores that sell fuel (Wawa, Sheetz, 7-Eleven) still go to meals. In the Monarch file the same store is fuel on one line and snacks on the next, and only the amount tells them apart.

There was a side finding about an earlier reading. One of the six held-out Mint files, from a student project, has labels that look shuffled: Uber trips filed as Restaurants, pizza as Ride Share. It drags the Mint held-out figures down. It stays in, as it was when those figures were first published.

`node eval/aggregator-exports.mjs` in `ventures/ai-bookkeeper` reruns all of this. The README section "Monarch and Rocket Money exports" has the details.
