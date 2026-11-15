---
title: "A Bottle Deposit on a Croatian E-Invoice Is Exempt in One Layer and Out of Scope in the Other"
seo_title: "Writing HR:POVNAK, HR:PP and HR:PPMV on a Croatian eRačun"
date: 2026-11-14
tags: [einvoice-preflight, croatia, e-invoicing]
description: "Croatia's eRačun writes a bottle deposit as exempt for EN 16931 and out of scope in the HR extension. The free creator now writes both layers."
---

A Croatian invoice for a crate of beer has three kinds of money on it: the beer, which carries 25 % VAT; consumption tax (*porez na potrošnju*, HR:PP); and the refundable bottle deposit (*povratna naknada*, HR:POVNAK). The last two are outside the VAT base. Since 1 January 2026, Fiskalizacija 2.0 makes structured e-invoices compulsory for domestic B2B sales, so those amounts have to go in the XML too.

The way the Porezna uprava's own sample eRačuni do it is odd at first sight. Each such amount is written **twice, in two different categories**:

| | EN 16931 layer (what every receiver reads) | HR extension (HRFISK20Data) |
|---|---|---|
| VAT category | E (exempt), 0 % | O (outside the scope of VAT) |
| label | reason text `#HR:POVNAK#Povratna naknada` | Name `HR:POVNAK` |
| tax scheme | VAT | OTH for a deposit, LOC for PP, CAR for PPMV |
| where the amount goes | the E row of the VAT breakdown | `OutOfScopeOfVATAmount`, and out of the HR tax base |

The reason is EN 16931 itself. Category O forbids VAT numbers on the invoice (rule BR-O-02) and cannot share an invoice with other categories (BR-O-11). Croatia requires the buyer's VAT number and puts deposits next to taxed goods. So the EU layer says "exempt", and the national extension says what the amount really is.

[E-invoice Preflight's invoice creator](https://marisstella.app/einvoice-preflight/create.html) wrote Croatian invoices from earlier today, but it couldn't write any of these. Three of the Tax Administration's samples also carry them as document-level *charges*, which the creator couldn't write in any country. Both work now:

- A line or a charge takes an HR label: POVNAK (deposit), PP (consumption tax), PPMV (special tax on motor vehicles) or N (another non-taxable fee, such as the tourist tax). The creator writes both layers the way the samples do.
- Every profile (XRechnung, Peppol, EN 16931, Croatia), in UBL and CII, now writes invoice-level allowances and charges: a discount, a shipping fee. Each counts in its own VAT row.

**Checked against the authority, twice.** We rebuilt the five samples that carry these amounts (a deposit as a line, a deposit as a charge, PP, PPMV on a car lease, tourist tax). Each came out at the sample's own amount due: 130.00, 130.00, 128.00, 14,500.00 and 135.00 EUR. Neither our checker nor the authority's own XSLT, run under Saxon, raised any HR rule on them. Then we made 34 deliberate faults, such as a euro too much out of scope, a charge with its label removed, or tax on an O row. Both engines named the same rules on all 34.

One finding along the way: the authority's rule HR-BR-29 ("an out-of-scope row carries no tax") compares a list of amounts with `= 0`. XPath reads that as "any of them is 0", so on an invoice with two out-of-scope rows, putting tax on one of them passes. HR-BR-28 and HR-BR-54 still catch it.

**What we haven't seen** is a real Croatian business's invoice with a deposit, or a receiver's verdict on one. If you send these, a rejection message would tell us more than any sample can. The details and the script are in the venture's `eval/hr-out-of-scope-creator-2026-11-14.md`.

*The creator runs in your browser and uploads nothing. It is not tax advice and not a certified invoicing system: check its output with your access point before you send it.*
