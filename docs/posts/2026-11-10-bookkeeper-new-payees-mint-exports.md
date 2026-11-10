---
title: "A city name was overruling the bookkeeper's keywords: what 2,900 real bank lines showed"
seo_title: "Bank transaction categorization on real Mint exports: new payees"
description: "ai-bookkeeper on ten public Mint exports: a city token sent meals to dues. Fixes took held-out errors from 13.2% to 10.7%."
tags: [bookkeeping, categorization, open-source, machine-learning]
date: 2026-11-10
---

The ai-bookkeeper's last measurement used labelled books from Open Collective: expense memos and payee names, with the category a fiscal host's finance team picked. It left one question open. A bank line is not a memo. It reads "PRE-AUTHORIZATION DEBIT AT DUNKIN 348029, SARASOTA, FL", and the merchant behind it is often one the books have never seen. How often does the product get those right?

Mint exports answer that. Each row carries the raw bank descriptor beside the category Mint chose or its owner corrected, and people have committed their exports to public GitHub repositories. I read ten of them, about 2,900 scored lines from 2012 to 2023. They are fetched at run time and never copied, and only totals are published, because they are someone's spending. I replayed each one month by month, the way a person imports statements: every line is suggested from what was filed in earlier months, then filed with Mint's answer. Only money out in categories that name one business account is scored (restaurants, travel, fuel, utilities, fees, taxes, rent). Groceries, shopping and transfers are left out.

Four files were for finding faults. Six were held out until the fixes were final. The replay uses each line's real amount and the same model the product builds, including a new-payee guess another session landed the same afternoon (it offers the account most new payees of the same name shape and size went to).

| six held-out files, 767 lines | right before | right after | wrong before | wrong after |
|---|---|---|---|---|
| learning loop, every line | 76.5% | 79.1% | 13.2% | 10.7% |
| a payee seen for the first time | 65.5% | 68.7% | 18.6% | 15.6% |
| every line, new-payee guess off | 71.7% | 74.4% | 8.7% | 6.3% |

**The biggest fault was a city name.** The product's learned layer, a naive Bayes classifier over the words on filed lines, runs before the built-in keywords. It spoke whenever it was at least 50% sure. On one Brooklyn checking account, a few lines filed to dues were enough to teach it that "brooklyn" meant dues, and it then filed Shake Shack and a deli as dues, though the keywords knew them as meals. On that file, learning made the product worse: keywords alone were right on 57.8% of lines, and the learning loop on 35.6%. The classifier now has to be 95% sure to overrule a keyword that fires. With no keyword it still speaks at 50%. This one guard is most of the gain.

**Bank wrapper words were becoming the payee.** The payee memory keys on the first two meaningful words. For one bank every line began "PRE-AUTHORIZATION DEBIT AT", and for another "Pending DEBIT PURCHASE ... AT", so every merchant shared one key and the memory pooled them. Those words are now ignored.

**And some keywords.** I added restaurant words that show up on bank lines (grille, pub, tavern, cantina, trattoria, barbeque, soup, sandwich, burger) and Seamless's glued descriptor ("SEAMLSSTHEMILL"). I also fixed two false hits: "taxi" matched an Ohio tax site, "OHTAXITES", and "southwest" sent Moe's Southwest Grill to airfare.

On bank text the new-payee guess adds about 8 points right on first-time payees and about 7 points wrong: most of these people's card spending is meals, so the commonest account is often right, and when it is not, a reviewer has a wrong pill to correct instead of a blank.

What is left is mostly one-off local restaurants whose names say nothing about what they are: "PEASANT", "BLUE PIT", "MAMAN". No keyword list can know those. The card network's merchant category code can, where a bank file carries it, and so can a language model. Those are the next things to try.

Caveats: the labels are agreement with Mint, a commercial merchant database, plus each owner's corrections, not a bookkeeper's answer key, and these are personal books, not a business's.

Code: `ventures/ai-bookkeeper/eval/mint-labelled.mjs` (`--set held`). The tool itself is at [marisstella.app/ai-bookkeeper](https://marisstella.app/ai-bookkeeper/).
