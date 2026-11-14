---
title: "SPRINT8006396111: when a bank glues the phone number onto the merchant's name"
seo_title: "Bank transaction payee names with glued numbers: keeping the merchant"
date: 2026-11-14
description: "Payee words with a digit were dropped, so SPRINT8006396111 had no payee. The fix, the first version that split stores by town, and real-export numbers."
tags: [ai-bookkeeper, evaluation, bank-statements, categorization]
---

The ai-bookkeeper remembers where you filed each payee. File one Sprint bill under phone and internet, and the next Sprint bill is suggested there. That memory runs on a payee key: the description with the noise taken out. `SQ *BLUE BOTTLE 0412 OAKLAND CA` becomes `blue bottle`.

One step in the cleanup was to drop any word with a digit in it. Store numbers, reference codes and card digits (`#0412`, `2K3`, `xx7730`) say nothing about who was paid. That works when the bank puts a space between the name and the number. Some banks don't.

## What real exports look like

A US Bank checking download, one of 63 real US bank exports the bank readers are tested on, writes a phone bill as `WEB AUTHORIZED PMT SPRINT8006396111`. Every word in it is either noise (`web`, `authorized`, `pmt`) or has a digit in it, so the payee key was empty. With an empty key the line has no payee at all. Nothing is remembered from it and nothing is guessed for it. Filing that bill a hundred times taught the books nothing.

The same thing turns up elsewhere: `SQ *CREPELANDIA210`, `707-652-3328ADAPTDMIND`, `NGRID37 NGRID37WEB` (a utility). Mint exports have `AMERICANAIR0012321621819 800-428-4322 TX`. One was worse than empty: `SIREN53313 CHICAGO IL` keyed as `chicago`, so every Chicago merchant with a glued name shared one memory.

## The first fix split Walgreens into one payee per town

The obvious fix is to keep the letters of a token like `SPRINT8006396111`. I tried that first: a token made of one run of letters and one run of digits keeps the letters. Then I checked which keys changed across the 5,767 rows of the 63 exports. Most changes were good. These were not:

- `walgreens` became `walgreens cincinnati`
- `marathon` became `marathon monroe`
- `arco ben` became `arco liaoning`

Store and city codes come glued too: `MARATHON PETRO13 11-20-24 MONROE6537`. Once the merchant's name is already in the key, letting glued tokens in adds the town. Each Walgreens then becomes a different payee and the memory has to start over in every town.

So the rule changed. A glued token keeps its letters only while no clean payee word has come before it. In `SPRINT8006396111` the glued token is the first real word, so it's the payee. In `WALGREENS #1234 00CINCINNATI` the name came first, so the glued town is dropped as before. Glued dates (`Jan29`, from a Citi line in a Mint export) are also dropped. So are tokens that mix letters and digits throughout, like `2K3` or `IBEXHSDFR2`. In these files those are always random references.

## Numbers, before and after

All on the same files, fetched at run time and never committed:

| set | before | after |
|---|---|---|
| 63 US exports: lines with no payee | 45 | 36 |
| Mint, 2,926 labelled lines: right | 90.6% | 90.7% |
| Toronto purchasing cards, 4,284 lines: right | 85.3% | 85.5% |
| Scottish Government cards, 11,087 lines: right | 78.8% | 78.8% |
| Capital One and Chase card files | | identical |

Across the 5,767 rows, ten keys changed. Nine of them were lines with no payee before. The 36 lines still without a payee really have none: they say only "Debit", "Deposit" or "Credit Card Payment".

On Mint, the new rule first turned one American Airlines line from blank into a wrong guess (Meals). Once the line had a payee, the new-payee guesser had something to work with, and it guessed wrong. The airline keyword was written as `american air`, with a space, so the glued form never matched it. It now matches `americanair`, `deltaair` and `unitedair` too, and both American Airlines lines go to Travel. Every Mint line that changed got better.

The gain is small because glued names are rare in these sets. But each of those lines was a payee the books could never learn.

## Old books still work

Changing the key affects anyone with saved books. Their memory is stored under the old keys. So when a line misses under the new key, the old key is tried before the line counts as a new payee. A W-9 flag or payee merge saved under the old key is still found when the 1099 contractor list is built. All of this is pinned in six tests.

Still untried: a US Bank business checking file, where `WEB AUTHORIZED PMT` lines are probably much more common. The details are in the [ai-bookkeeper README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ai-bookkeeper), "Glued numbers in payee names".
