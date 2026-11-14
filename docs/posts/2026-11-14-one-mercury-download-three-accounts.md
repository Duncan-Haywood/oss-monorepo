---
title: "One Mercury download, three bank accounts: what a real LLC's file taught the bookkeeper"
seo_title: "Importing a Mercury CSV that holds several accounts"
date: 2026-11-14
description: "A real LLC's Mercury download held two checking accounts and a card in one file. Now split, autopays paired, 90% right on the owner's labels."
tags: [ai-bookkeeper, bank-statements, mercury, evaluation]
---

Every business bank file the ai-bookkeeper had been tested on came from Chase. Today it read Mercury, the bank a lot of small US companies and startups open first. Five files in Mercury's download layout turned up in public GitHub repositories. Two look like an LLC's own download, and three are samples other projects wrote in the same layout. The script fetches them when it runs (`node eval/mercury-exports.mjs`) and never copies them, because the real ones contain names, emails and account digits.

## The file is not one account

A Chase download is one account. A Mercury download can hold every account the company has, with the account named on each row in a `Source Account` column. The first LLC's file held a checking account, a second checking account and the Mercury Credit card.

The reader didn't know that column. It put all 200 rows into whichever account you chose. The card's charges landed in checking. Each of the card's 24 autopayments showed up twice in that one account, once going out of checking and once coming into the card, and neither side had a partner to pair with. Nothing failed loudly. The books were just wrong.

`Source Account` is now read the same way as the `Account` column in Mint and Tiller exports. The page asks for a chart account for each name it finds, and so does `import file.csv --map "NAME"=CODE`. With the file split that way, the 48 autopayment and transfer lines pair up as transfers between the accounts (none did before), and the card's charges go to the card.

## Two category columns

Mercury writes two categories on each row. `Category` is the owner's own, and `Mercury Category` is Mercury's guess from the merchant (Software, Restaurants, FinancialInstitutionsAndFees). The reader only knew the first. The owner's label still wins. Mercury's now fills in when the owner left a line blank, and the suggestion always goes to review.

This file gave something rarer than a new layout. The owner had labelled 105 of their own bank lines: Bank Fees, Software & Subscriptions, Business Meals, Legal & Professional Services, Revenue. That is a business's own bookkeeping on its own bank text, which is the thing this project has been asking for. I hid that column, replayed the lines in date order, and scored the suggestions against the owner's answers:

| 100 money-out lines | before | after |
|---|---|---|
| right / wrong, every line | 85% / 6% | 90% / 3% |
| right / wrong, first time a payee appears (25 lines) | 44% / 24% | 64% / 12% |

Take that with care. It is one firm and 100 lines, with a few payees that repeat. One of the two new mappings (Mercury's own foreign-transaction fee label goes to Bank Fees, which held on 45 of 45 lines) was written after looking at this same file, so treat the gain as an upper bound.

## 197 charges that never happened

The second LLC's file has 372 rows. 197 of them are `Failed` card charges, an AI tool's subscription retried until it went through. The reader already skipped them, and it still does. If it had counted them, that company's software spend would have roughly doubled. On the lines that did go through, Mercury's `Software` label took a fresh import from 72 suggested lines to 167 of 174.

Two smaller fixes: the `Last Four Digits` column is kept as the card, so spend by card works on a Mercury card account (the cardholder's name and email in the same row are never kept), and a deposit marked `Received` is read as booked.

The next business files wanted are Relay's, Bluevine's and Novo's. The tool itself is free and runs in your browser: [ai-bookkeeper](https://marisstella.app/ai-bookkeeper/).

*Not financial or tax advice; check suggestions before you rely on them.*
