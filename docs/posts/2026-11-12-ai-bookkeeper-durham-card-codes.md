---
title: "A council's card books, a test the categoriser wasn't built on"
seo_title: "Merchant category codes on 151,000 council card lines"
date: 2026-11-12
description: "On six years of a council's card lines, the merchant category code took first-seen merchants from 53% to 88% right. The real file also booked spend as income."
tags: [ai-bookkeeper, evaluation, merchant-category-codes, bank-import]
---

The ai-bookkeeper suggests an account for each bank or card line. The hardest line is one from a merchant the books have never seen. For card lines, one clue helps: the card network's merchant category code (MCC), the four-digit number that says what kind of business took the money (5411 is a grocery store, 7011 a hotel). The categoriser reads that code. Once these books have filed a few lines from that category, it suggests the account they used. Before then, a fixed table of codes fills in.

Two buyers' published card books shaped that layer: the Scottish Government's and the City of Toronto's. A layer tuned on two datasets can flatter itself, so this run read it on a third that played no part in building it: Durham County Council's procurement-card report. Every month the council publishes every card line, with the merchant, the network's code and the expense type staff filed it to. That is 78 months, January 2020 to June 2026, and 199,776 lines. Nothing in the categoriser was changed after the reading.

## What the code is worth

151,437 charges carry an expense type that names an account in a small business's chart. The expense-type map was written before any scored run. They were replayed a day at a time from empty books, the way the import loop files them.

| 7,354 lines from a first-seen merchant | right | wrong |
|---|---|---|
| category layer off | 53.3% | 34.6% |
| fixed table of codes only | 69.4% | 25.2% |
| table, then the books' own filings (default) | 87.8% | 11.6% |

That is the largest gain of the three buyers: 34.5 points on Durham, against 24.6 in Scotland and 14.2 on a Toronto year. Most of it comes from the books' own habits, not the table. The table says what a merchant sells. It cannot say why this buyer bought it. Grocery-store and catch-all "miscellaneous retail" codes are deliberately left unmapped by the table, yet together they make up 52,000 lines here. The council files them as provisions and equipment, and after a few lines the books know that.

It also holds on books the size of a small business's. Departments read as their own books gained 7 to 35 points on first-seen merchants. Transformation and Partnerships has only 440 lines in six years and went from 54.3% to 72.8%.

A guess for split categories (the commonest account when no account has a majority) was left off after the Toronto reading. On Durham it changed nothing: with the books' habits in place, only 0.6% of new-merchant lines are left blank for it to fill. It stays off.

## The column that would have flattered it

Durham's report has a "Merchant Category" column next to the code, and it is not the network's category name. It is the council's own expense label for the code, so 5411 reads "Catering costs - provisions". Reading that column scores 97.7%, because the label is nearly the answer. Every figure above reads the code only. The importer works the same way: when a file has a code column, it ignores the name column beside it.

## What the real file broke

Before any scoring, the real file was imported the way a user would import it, and it came in wrong in three ways. The header wasn't recognised, so the reader fell back to guessing. The description was the department or the purpose of the spend, never the merchant. The code was dropped. And every charge was booked as money in.

The third fault is the dangerous one, and it isn't Durham's alone. The importer flips the signs on a card export when it finds rows like "Payment, thank you". A purchasing-card report has no such rows: it lists charges as positive and refunds as negative. The refunds also stopped the "every amount is positive" warning from firing, so the file imported silently as income. Toronto's report has the same shape.

The fix: a file with a merchant category column, one amount column, no balance and at least 80% of its amounts positive is now read as a card file. Its signs are flipped and the import says so. One more trap showed up in a single month: a merchant named "U OF I ONLINE PAYMENT" matched the weak card-payment pattern and blocked the flip. The rule now runs unless the payment rows prove the charges are already negative. All 78 real files now import every line with the right sign, the code on every line, and totals to the penny.

## Caveats

This is one council, with its own expense list, and mapping it to a small business's chart is a judgment. Equipment counts as right whether it is filed to supplies or to fixed assets. Some misses are arguable: Adobe Creative Cloud filed as "equipment and materials" counts as wrong when the layer says software. The data is Durham County Council's, under the Open Government Licence v3.0. It is fetched at run time and not copied into the repository. The command is `node eval/durham-pcard.mjs --dir <folder>` in `ventures/ai-bookkeeper`.
