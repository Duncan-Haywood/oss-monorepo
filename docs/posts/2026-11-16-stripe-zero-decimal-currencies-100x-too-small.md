---
title: "Three of our Stripe tools showed some currencies 100 times too small"
date: 2026-11-16
tags: [redteam, stripe, currencies, dunning-engine, trial-converter, cancel-flow, testing]
seo_title: "Stripe zero-decimal currencies: three tools showed 100x too small"
description: "Stripe has 16 zero-decimal currencies. Our dunning, trial and cancel-flow tools knew 10, 7 and 4 of them, so a 5,000 XPF invoice was emailed as CFPF 50."
---

Stripe sends every amount as an integer in the currency's smallest unit. For most currencies that unit is the cent, so `4900` in USD means $49.00. Stripe also has a list of [zero-decimal currencies](https://docs.stripe.com/currencies#zero-decimal) whose smallest unit is the whole currency. In yen, `5000` means ¥5,000, not ¥50. The list has 16 codes: BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF and XPF.

Today's red-team run started on the admin page of the [Dunning Engine](../../ventures/dunning-engine/README.md), our self-hosted failed-payment recovery service. We seeded 8 small faults into `admin.mjs`, and none of the tests caught any of them. That made sense once we looked: the page's script was never run by a test. Only its HTML string was checked. While writing the missing tests we read the code the page relies on, and found that `formatMoney` knew 10 of the 16 zero-decimal codes.

**What a customer would have seen.** If a shop bills in CFP francs (XPF, used in New Caledonia and French Polynesia) and a 5,000 XPF payment fails, the recovery email says "We couldn't collect CFPF 50". That is a hundredth of what the customer owes. The same happens for the Burundian, Djiboutian, Guinean and Comorian francs, the Malagasy ariary and the Vanuatu vatu.

Then we searched the other ventures for the same hand-written list:

| Tool | Codes it knew | Missing |
|---|---|---|
| Dunning Engine (`formatMoney`) | 10 of 16 | BIF, DJF, GNF, KMF, MGA, VUV, XPF |
| Trial Converter (`formatMoney`) | 7 of 16 | BIF, DJF, GNF, KMF, MGA, PYG, RWF, VUV, XPF |
| Cancel Flow (`formatMoney`) | 4 of 16 | everything except JPY, KRW, VND, CLP |
| Changepoint Detector (`minorUnits`) | 16 of 16 | none |

The Changepoint Detector had the full list, copied from Stripe's page. The other three each started with a short list that covered the currencies their authors thought of, and nothing ever checked them.

**What we changed.**

- All three lists now hold the full 16. Each tool has a test that formats 5,000 in every zero-decimal code and expects "5,000". The tests failed before the fix.
- A new check, `platform/ci/check_stripe_zero_decimal.py`, finds every quoted list in `ventures/` and `platform/` made only of zero-decimal codes that includes both JPY and KRW, and fails if any of Stripe's 16 is missing. Before the fix it flagged all three lists. It flags none now. It takes under a second, and it runs on every venture pull request with no workflow change, because `unwired_checks.py` runs every `check_*.py` that no workflow names.
- The Dunning Engine dashboard had a second gap. Its summary cards skip any field that is an object, and the money still at risk arrives as `{usd: 400, eur: 250}`, so the page never showed it. The summary now also returns `atRisk` as a formatted string ("$4.00 + €2.50"), which appears as a card.
- `admin.test.mjs` runs the page's script against a small fake DOM and a stubbed `fetch`. It checks the wrong-key message, the case table, the dry-run banner and the holdout-experiment text. All 5 seeded faults that change what an operator sees are now caught. The other 3 changed a CSS colour or margin by one step, and we recorded them as having no visible effect.

**What to take from it.** If you hand-convert Stripe amounts, don't write the zero-decimal list from memory. Copy all 16 codes from Stripe's page, and add a test that loops over every one of them.
