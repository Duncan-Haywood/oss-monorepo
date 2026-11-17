---
title: "The bookkeeper had never heard of Tesco"
seo_title: "UK card transactions in an open-source categorizer: Tesco, Screwfix"
date: 2026-11-15
description: "An open-source bookkeeper's keywords knew Kroger and Home Depot but not Tesco or Screwfix. Tested on three UK councils' card lines, two held out."
tags: [ai-bookkeeper, evaluation, uk, categorization]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) suggests an account for each bank or card line. On a brand-new set of books, before it has learned anything from you, the only layer that can say anything is a table of built-in keywords: "kroger" is meals, "home depot" is supplies, "usps" is postage.

That table was written from US exports. Today we tested what it does on UK card lines. The answer was close to nothing.

## Three councils' card statements

UK councils publish their purchasing-card spending. Some reports also say how the council filed each line, which makes them labelled test data. We already had two of these (Durham County Council and the Scottish Government). Today we added a third: South Lakeland District Council, 54 monthly reports from 2014 to 2019. 3,311 of its lines carry a procurement class that maps onto a small business's chart of accounts: "Public Transport", "Accommodation", "Stationery".

We gave the tool only the merchant's name, starting from empty books. On all three buyers the keywords said nothing on 85 to 90% of lines. Trainline, Travelodge, Ryanair, Screwfix, Royal Mail and Tesco were all blank.

## Writing the UK block, then checking it on files we hadn't read

We wrote a block of UK names from South Lakeland's list of blanks. For each one we used the account its US equivalent already had: Tesco is filed like Kroger, Screwfix like Home Depot, Royal Mail like USPS. Discount and department stores (Argos, Home Bargains, Poundland, M&S) stay blank, as Walmart and Target do, because you can't tell from the name what was bought. HMRC stays blank too, because a payment to HMRC is usually VAT or PAYE you owe, not an expense.

Durham's and the Scottish Government's lines were scored before the block was written, and we didn't look at them until it had run. Right / wrong, from empty books:

| buyer | before | UK block |
|---|---|---|
| South Lakeland (written from it) | 8.7% / 1.5% | 39.7% / 5.7% |
| Durham (held out) | 10.6% / 2.1% | 28.1% / 3.0% |
| Scottish Government (held out) | 8.5% / 6.2% | 11.8% / 6.5% |

The Scottish file barely moves because it lists only payments over £500, and few of those are at chains.

## What the held-out misses taught

Next we read Durham's new misses. The biggest lesson was that a supermarket's petrol station prints the supermarket's name: "TESCO PFS 4088", "ASDA PETROL", "TESCO PAY AT PUMP". Those had gone to meals. They now go to vehicle and fuel. We dropped three names because they were wrong more often than right: Halfords (bikes, car parts or tools; Durham filed 87 of its 113 lines elsewhere), NCP car parks and DVSA. "Iceland Travel" no longer counts as the frozen-food shop. After those changes Durham reads 28.2% right and 2.8% wrong, but those figures are fitted to Durham. The held-out number is the one in the table.

## What it doesn't do

The gain is on your first import. Once your books have filed a merchant, the tool's memory of your own choices does the work. On a card file that carries the network's merchant category code, that layer already covers almost every new merchant. So when the books learn as they go, the improvement is small: first-seen merchants on South Lakeland went from 34.2% to 39.6% right, and Durham's code-based figure stayed at 87.8%.

The labels are councils' own. South Lakeland filed some Trainline tickets as "accountancy" and most Sainsbury's lines as consumables, so the tool's wrong rate there went up from 1.5% to 5.3%. We counted those as misses rather than argue with the council's filing. The US labelled sets (YNAB, Mint, Monarch, Rocket Money, Mercury, a software LLC's books) read the same or a line better.

The full tables and commands are in the README section "UK merchants in the built-in keywords". The fetch scripts are `eval/southlakeland-pcard.mjs` and `eval/uk-card-keywords.mjs`. The council data is under the Open Government Licence and isn't copied into the repository.
