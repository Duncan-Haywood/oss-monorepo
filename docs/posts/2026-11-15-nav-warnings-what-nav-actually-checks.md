---
title: "We checked a Hungarian invoice for five things NAV never checks"
seo_title: "NAV Online Számla warnings: what Annex I actually checks"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "NAV's Annex I, read warning by warning: five checks NAV never makes, six renamed codes, a euro tolerance 100 times too loose, 21 missing warnings."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) reads Hungary's NAV Online Számla 3.0 reports: the `InvoiceData` XML that every Hungarian invoicing program sends to the tax authority. When the numbers on a report don't add up, NAV still accepts it but attaches a *warning*. Our checker tries to tell you before you send which warnings NAV will give.

We first wrote those arithmetic checks from the warning **names**. A name like `INCORRECT_LINE_CALCULATION_VAT_AMOUNT` seems to explain itself. Today we read Annex I of NAV's interface specification (the English PDF dated 2026.02.12, from about page 270). It defines each warning: its formula, when it runs, and what its "1%" is 1% of. Here is what we found.

## Five checks NAV never makes

NAV does not check a line's VAT against its rate. There is no `INCORRECT_LINE_CALCULATION_VAT_AMOUNT`. NAV also doesn't check a normal line's gross against net plus VAT in the invoice currency. It does that check only in forints. Three more codes we cited for summary rows don't exist either; one was phased out in version 1.1.

We kept those five checks. A wrong line VAT is still a wrong invoice. But each one now says it is our own check and that NAV accepts the file without a word. Every finding also carries a `nav` field: the Annex I code it mirrors, or `null`. A bookkeeper can now tell "NAV will flag this" apart from "NAV won't notice, but your customer might."

## Six renamed codes

Several warnings were renamed between versions. The total-gross check is `..._INVOICE_GROSS_AMOUNT_SUMMARY`, not `..._INVOICE_GROSS_AMOUNT`, and the row VAT check gained `_SUMMARY`. On simplified invoices the gross-total checks are called `..._INVOICE_VAT_AMOUNT`, even though they check the gross. When a NAV reply quotes a code, our message now shows the same code.

## The tolerance was 100 times too loose for euro invoices

We had read the tolerance as "1% of the amount, never less than one unit". Annex I says something different: 1% of a named value, but at least 1 HUF or 0.01 units of the invoice currency, whichever is greater. On a forint invoice the two readings agree, because the floor is 1 HUF either way. On a euro invoice our floor was 1.00 EUR where NAV's is 0.01 EUR. So a line VAT 50 cents off a 32.40 EUR amount, which is past NAV's limit, got through. It doesn't now.

## When a warning runs

Annex I also says when each warning runs, and we had some of those conditions wrong:

- A line with a discount (`discountValue`, or `discountRate` as a fraction) is checked with the discount taken off. We used to skip it.
- A VAT-rate row with a zero base is not checked against its lines.
- On a modification, a summary rate that no line carries is flagged only when the lines carry amounts.

## 21 warnings we didn't have

All 54 active warnings in these families are now in. The 21 new ones include:

- the forint gross against forint net plus VAT, on lines;
- a row's forint VAT against its forint net;
- the lines' forint nets against the invoice's forint total;
- the gross total converted at the exchange rate;
- a new invoice with a negative total;
- the simplified-invoice sums, taken straight from the lines;
- a rate or marker (reverse charge, margin scheme) in the summary that no line has;
- a reverse-charge or margin-scheme row that still carries VAT.

## How we measured

The changes left NAV's own 30 sample files where they were: 27 with no finding, and the same 5 findings in 3 files, each a real fault in NAV's sample. The tighter euro floor added nothing to NAV's five foreign-currency samples.

We also seeded 633 faults into those samples. 624 were caught by the rule we expected. Of the 9 misses, one was missed before this change too. The other 8 are cases where Annex I says the warning doesn't run: a forint gross bumped on a reverse-charge line that has no VAT data, a forint VAT bumped on an exempt row, and extra summary rows on modifications whose lines carry no amounts. A new test holds Annex I's code list and fails if the checker ever cites a code that isn't on it.

What we still don't have is a real business's report with NAV's actual reply to compare against. These checks follow what NAV wrote down, not replies we've seen. If you have a report NAV warned about, the checker runs in your browser and never uploads the file. The write-up is in the repository: `ventures/einvoice-preflight/eval/nav-annex1-calculations-2026-11-15.md`.

*This is an offline check of a file against NAV's published rules. It is not NAV's acceptance and not tax advice.*
