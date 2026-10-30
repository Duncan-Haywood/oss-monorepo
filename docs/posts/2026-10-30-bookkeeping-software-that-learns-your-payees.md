---
title: "What happens when bookkeeping software learns your payees: 72% to 96% on a real bank file"
seo_title: "Auto-categorising bank transactions: how much does learning help?"
date: 2026-10-30
tags: [ai-bookkeeper, bookkeeping, categorization, small-business]
description: "A makerspace's real 2019-2023 bank exports, replayed in date order: built-in rules alone file 70% correctly, learning from each filed line reaches 96%."
---

Most bookkeeping tools promise to "learn" how you categorise spending. We
measured it on a real bank file instead of asserting it.

**The data.** A San Francisco makerspace published its own bank exports for
2019 to 2023, with the category its treasurers gave each line. We kept the 278
lines whose label names one account, and replayed them in date order: for each
line, suggest a category from only what had been filed before it, then file it
the way the treasurers did.

**The result (AI Bookkeeper, no AI model, all in your browser):**

| | Suggested | Right of all lines |
|---|---|---|
| Built-in keyword rules only | 72.7% | 69.8% |
| Rules plus learning from each filed line | 98.9% | 96.0% |

By year the learning version scored 93.5%, 98.7%, 94.3% and 97.1%. Most
suggestions (250 of 275) came from simple payee memory: once you file
"GOOGLE*CLOUD 01E INTERNET" as software, next month's line with a different
date and card digits is filed for you. All 8 misses were PayPal payouts the
tool treats as transfers and this organisation treated as income.

**Cleaner names, same story.** On a second nonprofit's ledger (clean payee
names, 1,241 lines) learning reached 87.7% right of all lines, against about
40% from keywords alone.

**Caveats.** Two small organisations, the labels are whatever their treasurers
chose, and some keyword rules were tuned on these same files, so the keyword
row flatters itself. Your books will differ; the shape should not: a year of
filing makes most months automatic.

You can try it with your own bank CSV at no cost; nothing leaves your device.
The replay script is `ventures/ai-bookkeeper/eval/queeriouslabs-online.mjs`.
