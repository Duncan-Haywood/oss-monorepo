---
title: "Real bank descriptors: 9% to 72% auto-suggested on a makerspace's books"
seo_title: "Real bank descriptors: 9% to 72% auto-suggested on real books"
date: 2026-10-25
description: "ai-bookkeeper's built-in keywords scored on a real nonprofit's bank exports for the first time, what failed, and why the gain is smaller than it looks."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

Until now [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s keyword layer was
scored on made-up merchants. This run scored it on a real small organisation:
a San Francisco makerspace published five years of its bank exports
(402 lines, 2019 to 2023) with its own category on each line.

**Before:** the built-in keywords suggested an account for 9.4% of the 278
lines whose label names one account. Real descriptors are bank text, not
merchant names: `ACH DEBIT PGANDE -WEB ONLINE`, `GOOGLE*CLOUD 01E INTERNET`,
`DEBIT CARD #XXXX 10/31 MONKEYBRAINS 415-974-1313 CA`.

**After** adding PG&E's truncated spellings, small ISPs, Google Cloud and other
hosts, Patreon as sales and "secretary of" as a filing fee: 71.9% suggested,
96% of those right. The 8 wrong ones are PayPal payouts booked as a transfer
where this organisation counts them as income. With a PayPal account in your
chart a transfer is right, so that stays.

Why it is smaller than it looks: one organisation, a handful of recurring
vendors carry most of the gain, and the rules were tuned on the file they are
scored on. Another organisation will land well below 72%. What no text rule can
fix is `CHECK WITHDRAWAL` (their rent, 48 lines) and `DEPOSIT - BRANCH`; that is
what payee memory and the review queue are for.

The scoring script is `eval/queeriouslabs-bank.mjs`. The data has no licence
file, so it is fetched at run time and never copied into the repo.
