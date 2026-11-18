---
title: "A Copilot Money export read backwards: 1,577 purchases booked as income"
seo_title: "Importing Copilot Money CSV exports: positive amounts are spending"
date: 2026-11-15
description: "Copilot Money writes spending as positive amounts, and ai-bookkeeper read a real household export backwards. The fix, the transfer type, and an eval bug."
tags: [ai-bookkeeper, bank-statements, evaluation, copilot-money]
---

Mint shut down in 2024, and its users scattered to a few budgeting apps. The ai-bookkeeper already read exports from two of them, Monarch and Rocket Money. Today it met the third, Copilot Money. Two people had committed Copilot exports to public GitHub repositories: a Florida household's ten months of 2026 across 15 accounts, and one person's cards and checking from 2022 to 2024. Both carry the category each line was filed under, so they work as answer keys. They are fetched when the evaluation runs and never copied into this repository.

## Every sign the wrong way round

Copilot writes money out as a positive number and income as a negative one. A $9.06 Hulu charge is `9.06`, and a paycheque is `-3916.21`. Most banks do it the other way. A bank CSV with no balance column gives a reader nothing to tell the two conventions apart. Card files usually help, because a card statement has a "payment, thank you" line that only makes sense one way round. That's how the reader handles them.

The household file had no such line. The reader didn't know Copilot's layout, so it kept the signs as written. 1,577 purchases came in as money received, and the paycheques came in as spending. The second file came out right only by luck: its card-payment rows tripped the card test, and the reader decided it was an Amex statement.

The fix is to know the layout. The header (`date, name, amount, status, category, parent category, excluded, tags, type, account, account mask, ...`) is now named `copilot-money`, in both spellings it has had. The reader flips its signs and says so in a note.

## Copilot already knows which lines are transfers

Copilot adds a `type` column: `regular`, `income` or `internal transfer`. That last one is money moving between the owner's own accounts, such as a card paid from checking or savings topped up. It is neither an expense nor income, and books that count it as either are wrong twice over. Copilot's category on those lines is often just "miscellaneous", so the reader now takes the type itself as the label and suggests "transfer" for review.

In the second file, 707 lines were typed internal transfers. Before today, with no history, 311 of them were suggested as transfers, 334 got no suggestion, and 62 were suggested as income. Now 645 are suggested as transfers. The 62 are all `Zelle Payment From <a person>`, and they still go to income. In a small business's books a Zelle from a person is often a customer paying, and one correction teaches the books otherwise.

## The answer key was shifted by a line break

The first scores on the household file looked bad: Hulu came out labelled as restaurants, and the learning loop was right on only 54.5% of lines. But Hulu is filed under Subscriptions all ten times in the raw file.

The cause was in the evaluation, not the product. The helper that hides the category column numbered labels by record, while the reader numbers rows by the line of the file they start on. One household note reads "Coffee, Ziploc, Filtros" with a line break inside the quotes. From that row on, every label belonged to the row above. With labels keyed by line, the loop's figure went to 79.6%. The same helper scores the Mercury, YNAB and Mint replays. I re-ran them and their numbers didn't move, so nothing published before was wrong. It would have been on the next file with a line break in a note.

## The keywords, and what they shouldn't learn

A few new merchant keywords came from the household's misses: Claude.ai, Otter.ai and Google One as software, Marathon fuel, JustPark, auto leases, Florida's E-PASS toll, Florida Power & Light, and Duke Energy's glued `DUKEENERGY`. With no history, the keywords now get the household's lines right 50.0% of the time, up from 39.9%, and the wrong rate stays at 5.9%. On the second file, which no keyword was written from (though I had read its top misses), they went from 58.7% to 59.2%. So most of the household gain is fitted to that household.

Most of the misses left are a household's trip budget. A cafe, a grocer, a pharmacy or an ATM withdrawal on holiday is filed as "Travel & Vacation". That is a sensible way to budget, but a bookkeeper would file a meal as a meal, so no keyword copies it. Netflix and Kindle stay with a person too. In a business's books, a streaming subscription is as often the owner's own.

The numbers, the commands and the caveats are in the ai-bookkeeper README, under "Copilot Money exports". The tests use made-up rows under the real headers.
