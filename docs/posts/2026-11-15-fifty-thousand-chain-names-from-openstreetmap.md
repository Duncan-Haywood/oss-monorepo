---
title: "Fifty thousand chain names from OpenStreetMap, tried on bank lines"
seo_title: "Categorizing bank lines with OpenStreetMap chain names"
date: 2026-11-15
description: "OpenStreetMap's list of 50,000 chains as a hint for new merchants in an open-source bookkeeper: 91% right where it spoke on one held-out council."
tags: [ai-bookkeeper, evaluation, open-data, categorization]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) suggests an account for each bank or card line. Once you have filed a merchant, it remembers your choice. The hard case is a merchant it has never seen, on a file with no card category code. Then the only help is a table of keywords written by hand: "kroger" is meals, "home depot" is supplies.

A hand-written table only ever covers the big names. Heron Foods, Wolseley, Scotmid, Cava and Blake's Lotaburger are not in it. Someone has already listed them, though.

## The list OpenStreetMap already keeps

OpenStreetMap mappers use the [name-suggestion-index](https://github.com/osmlab/name-suggestion-index) (NSI) to tag chain stores consistently. It covers about 50,000 brands worldwide, each with the kind of place it is: `shop=supermarket`, `amenity=fuel`, `tourism=hotel`, `shop=doityourself`. It is BSD-licensed, so we can ship it inside an MIT project as long as we keep its notice.

We mapped the kinds of place to a small business's chart of accounts. To stay consistent with the hand-written table, supermarkets and restaurants went to meals, hotels and car hire to travel, fuel and tyres to vehicle, and DIY and trade counters to supplies. We wrote that map before scoring a single bank line. We left out any kind of place that could mean two accounts: clothes, department stores, pharmacies, electronics, banks and parking.

The new layer comes after the keywords, the card code and the bank's own category label, so it only fills lines nothing else could place. It never posts a line on its own. It suggests the account, and you accept it or not.

## Two design choices that did most of the work

**Longest name wins, and an unlisted longer name blocks a shorter one.** "Total" is a fuel brand, but "Total Wine" is an off-licence, which we don't map. A line that starts "TOTAL WINE" therefore gets nothing, not fuel.

**One-word names that are ordinary words are dropped.** Access, Bell, Advantage, Shell, Target and Express are all chains. They are also words that start plenty of unrelated bank lines. We dropped about 60,000 common English words from the single-word names (a word list read only at build time). The famous ones among them, such as Shell and Subway, were already in the hand-written table.

## Results

We tuned on two sets: one council's card lines and four people's Mint exports. Then we locked the layer and ran it on files we hadn't looked at. Right / wrong, from empty books, merchant name only:

| set | lines | layer off | on | lines it spoke on (right) |
|---|---|---|---|---|
| Mint exports, tuning half | 2,159 | 57.5% / 3.8% | 59.1% / 3.8% | |
| South Lakeland council, tuning | 3,311 | 39.4% / 5.3% | 39.9% / 5.4% | 19 (16) |
| Durham County Council, held out | 151,437 | 28.2% / 2.8% | 29.6% / 2.9% | 2,210 (2,022) |
| Scottish Government, held out | 11,087 | 11.8% / 6.5% | 12.3% / 7.1% | 134 (61) |
| 63 US bank exports, no labels, held out | 4,927 out | | | 48 (48, read by eye) |

On Durham it was right on 91% of the lines it spoke on: Heron Foods, Wolseley, Scotmid, Costa, One Stop, Farmfoods, Dulux Decorator Centre and Toby Carvery. On the US exports every changed line was the right kind of place: Arby's, Cava, Peet's, Vons, Harris Teeter, Sprouts, Smashburger, Candlewood Suites and O'Reilly Auto Parts.

## Where it went wrong

The Scottish Government file was worse with the layer on: 61 right and 73 wrong. Two causes stand out.

- **Hotels the government hired as venues.** That file lists only spending over £500. At that size, a Malmaison, Crowne Plaza or Novotel line is usually a conference room, and the government filed it as hire, not travel. A small business's hotel line is usually a stay, but that is a judgment about the user, not the merchant.
- **A surname that is also a brand.** Baxter is a car-service chain in the index. Baxter Storey is a catering company. That one name produced 26 wrong lines.

Reading those misses also turned up a bug. The hand-written table already knew that "Iceland Travel" is not the frozen-food grocer, but the new layer matched "iceland" and undid that exception. Now, when the table knows a chain's name, it decides; the layer never overrules it. The test suite caught one more: "JOHN DEERE FINANCIAL" is a loan, not a trip to the dealer. A chain's name followed by "financial", "bank", "credit" or "insurance" now gets nothing.

## What it is good for

This mostly helps on your first import, before the books know anything. Once you have filed a merchant, your own memory takes over. On card files that carry a merchant category code, the code layer already places almost every new merchant. The gain is small on average because most lines are big names the keywords already know, or local firms no list will ever have. Where it speaks, it is usually right. The full tables, including first-seen merchants in the learning loop, are in the [README](../../ventures/ai-bookkeeper/README.md) under "Chain names from OpenStreetMap".
