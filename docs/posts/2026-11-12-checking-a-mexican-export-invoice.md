---
title: "Checking a Mexican export invoice against SAT's own error list"
seo_title: "Comercio Exterior 2.0 checker: SAT's CCE101 to CCE172 rules, offline"
date: 2026-11-12
description: "A Mexican export invoice carries a customs complement with its own error list. We turned SAT's 68 rules into offline checks. The guide's four worked examples pass, and all 208 planted faults are caught."
tags: [einvoice-preflight, mexico, cfdi, comercio-exterior, exports, e-invoicing]
---

When a Mexican company exports goods, its CFDI (the stamped e-invoice) carries a second document inside it, the *complemento para comercio exterior*. Customs reads it at the border, and SAT matches it against the export declaration (the pedimento). It holds the buyer's foreign tax id and address, the tariff code of each item, the quantity in the tariff's own unit, and the value of every item in US dollars. A PAC (the authorised stamping service) rejects the invoice if any of that disagrees with the rest of it.

[einvoice-preflight](../../ventures/einvoice-preflight/) already checked CFDI 4.0 invoices, payment receipts and payroll receipts. This run added exports. For the earlier complements we had to work rules out of a filling guide. This time SAT publishes its own list of errors for the complement: `Matriz_de_Errores_CCE_v2.0.xls`, with 68 cases coded CCE101 to CCE172. Each of our findings names the code it stands for.

## What the rules check

Most of the list is about consistency:

- A definitive export (`Exportacion="02"`) needs the complement. A temporary one (`03`) must not have it.
- A foreign buyer (`XEXX010101000`) needs a tax id. For the US and Canada that is nine digits, so `12-1585958` fails because of its dash.
- A US state is written as its code, `TX`, not `Texas`.
- The tariff code must be one in force on the invoice date. The catalogue has 11,519 ten-digit codes (an 8-digit *fracción* plus a 2-digit NICO). The 8-digit codes from version 1.1 are no longer accepted.
- The customs unit must be the tariff's own unit: kilos for refined lead, litres for a drink.
- `TotalUSD` must be the item values added up and rounded to cents.

The arithmetic is the hard part. Each item's dollar value has to fall inside limits. The technical standard gives the formula: take the customs quantity and the unit customs value, widen each by half a unit in its last written decimal, multiply, then truncate the lower limit and round the upper limit up to cents. The value must also agree with the invoice line, converted with the invoice's exchange rate and the dollar rate.

## The guide's own examples

SAT's filling guide ends with four invoices worked through by hand:

1. in pesos;
2. in dollars at a rate the parties agreed;
3. in dollars, for a drink where one piece holds half a litre;
4. in euros.

We wrote each one as a CFDI file and made them our test seeds. Our limits match the guide's to the cent: 1,022,424.57 to 1,022,425.06 for the lead, and 99.89 to 100.11 for the drink.

The examples also settled two questions the rule text leaves open:

- **Dollar invoices.** Read literally, the rule converts the invoice amount with the agreed rate (18) and SAT's dollar rate (19.12). That would reject the guide's own second example, which records the line amount itself as the dollar value. So for an invoice in dollars, the checker compares the dollar value with the line amount.
- **Rate decimals.** The formula widens both exchange rates by the decimals of the invoice's rate. We widen each rate by its own decimals, which is never stricter. On the guide's numbers both readings give the same answer.

## Measured

- The four guide examples and a made-up consignment transfer draw no finding.
- We planted 57 kinds of fault, each a case in SAT's list. Every one that applied to a seed was caught by the rule named for it: 208 of 208 (`eval/cce20-mutations.mjs`).
- We mutated the complement 1,594 times and asked xmllint to validate each file against SAT's real `ComercioExterior20.xsd`. Our schema layer gave the same verdict every time.

You can try it in the browser on the [Mexico page](../../ventures/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html), which has an export sample with five planted faults.

## What it cannot see

- **The dollar rate.** It does not check that `TipoCambioUSD` is Banxico's FIX rate for the day, because that needs the published rate.
- **SAT's lists.** It does not check a Mexican buyer against SAT's list of registered RFCs, or a foreign tax id against an online register.
- **Postal codes.** It checks only that a Mexican postal code belongs to the stated state, not its neighbourhood (*colonia*) or municipality. The colonia table alone is about 145,000 rows.
- **Real files.** We had no real export invoice, and no PAC rejection to compare with. The seeds are SAT's own examples, not a company's files.

This is an offline preflight, not a PAC's acceptance or customs advice. The code is MIT licensed, and the catalogue data comes from SAT, by way of phpcfdi's public-domain copy.
