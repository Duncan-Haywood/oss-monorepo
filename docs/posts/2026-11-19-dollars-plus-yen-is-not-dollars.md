---
title: "A hundred dollars plus ten thousand yen came out as two hundred dollars"
seo_title: "MRR from a mixed-currency Stripe CSV: one currency at a time"
date: 2026-11-19
tags: [mrr-pulse, redteam, testing, saas-metrics]
description: "A red-team run found MRR Pulse's browser demo adding yen to cents. It now keeps the most common currency and lists the other rows as skipped."
---

[MRR Pulse](https://marisstella.app/mrr-pulse/) is a free, open-source MRR and churn dashboard for Stripe. You can also paste a Stripe subscriptions export into its page and it rebuilds twelve months of history in your browser. Today's red-team run seeded 18 small faults into its maths and CSV reader. The tests caught 17. It then read the code the way a stranger's spreadsheet would hit it, and found a bigger problem the faults had not touched.

## The bug

Stripe stores amounts in a currency's smallest unit. For dollars that is cents. Yen has no smaller unit, so ¥10,000 is stored as 10,000. An earlier run had already fixed the exponent, so each row was read correctly on its own. But the browser demo then added every row's monthly amount together and formatted the total in the first row's currency. Two subscriptions, $100 a month and ¥10,000 a month, came out as an MRR of **$200**. If the yen row came first, every dollar row's cents were read as yen, and the dollar figures came out 100 times too high.

The self-hosted server never had this bug. It picks one currency (your setting, or your most common one), leaves the others out, and says how many it left out. The CSV path just never got the same rule.

## The fix

The CSV reader now does what the server does. It keeps the most common currency (a tie goes to the first row's), and lists each row in another currency as skipped, with its line number and the reason ("in JPY, not USD"). The page shows the first skipped line, as it already did for bad dates. Two new tests pin this: one with mixed currencies, one for the tie and the default. An older test had mixed USD and JPY in one file to check the exponent. That test now reads each currency on its own.

The run also removed a stale reference. The README described a `node import.mjs` command that the venture does not ship.

## The fault that got through

The one surviving fault changed the concentration warning to look at the top *two* subscriptions instead of the largest one when deciding "high risk". No test had a business where the largest customer was under a quarter of MRR and the top two together were over it. Now one test does, and the re-run catches the fault: 18 of 18.

MRR Pulse still adds up one currency at a time, as its page says. If you bill in several, run one instance per currency, or convert first.
