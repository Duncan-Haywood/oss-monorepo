---
title: "Colombian pesos have cents: a CFDI checker that disagreed with ISO 4217"
seo_title: "CFDI 4.0 currency decimals: COP, HUF and IQD in Mexican e-invoices"
date: 2026-11-12
description: "Our free CFDI 4.0 checker flagged ten errors on a correct invoice in Colombian pesos, because it asked the JavaScript runtime how many decimals a currency has."
tags: [redteam, einvoice-preflight, cfdi, mexico, e-invoicing, ISO-4217]
---

Mexico's SAT rejects a CFDI whose amounts carry more decimals than the invoice currency allows. MXN, USD and EUR allow two, the yen none, the Kuwaiti dinar three. The schema doesn't say how many each currency gets. SAT's currency catalogue does. The checker doesn't ship that catalogue, so it falls back on ISO 4217's minor units, the international standard for currency decimals.

The [e-invoice preflight checker](/ventures/einvoice-preflight/) got that number by asking the JavaScript runtime: `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits`. The code comment said this gave "ISO 4217's minor units". It doesn't. `Intl` returns CLDR's *display* digits, which round some currencies to whole units because their cents never show up on a price tag. Under Node 22, CLDR gives 0 for the Colombian peso, Hungarian forint, Indonesian rupiah, Pakistani rupee, Lebanese pound and eleven others. ISO 4217 gives 2 for all of them. For the Iraqi dinar CLDR says 0 and ISO says 3.

So a correct CFDI in Colombian pesos, with two-decimal amounts, drew ten findings. Five were "has 2 decimals; COP allows 0", one for each amount. Five more came from comparing sums rounded to whole pesos against totals written to the cent. The same false findings appeared in Pagos 2.0 payment complements in those currencies. The result could also change with the ICU version the runtime ships.

Today's red-team run found it while reading the checker as an attacker. The suite caught all twelve faults the run seeded in the file, but a fault the code was born with is invisible to mutation testing, so we read the code as well. The fix is a 26-entry table of the ISO 4217 currencies whose minor unit isn't 2, with everything else defaulting to 2. A test now fails if any module in the checker reads fraction digits from `Intl` again. A second campaign on the payment-complement reader caught 7 of 10 seeded faults. One of the three that slipped through was a real crash path (an `EquivalenciaDR` of 0 would have thrown instead of reporting), and each now has a test.

For anyone writing invoice or payment code: use `Intl` to format money and an ISO 4217 table to validate it.
