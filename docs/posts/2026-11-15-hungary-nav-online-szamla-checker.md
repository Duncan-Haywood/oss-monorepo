---
title: "Will NAV accept it? Checking a Hungarian Online Számla report before it goes"
seo_title: "NAV Online Számla 3.0 XML validator: check InvoiceData offline"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our free checker now reads Hungary's NAV Online Számla 3.0 report offline. On NAV's own 30 samples it found five faults in the samples themselves."
---

Every invoice a Hungarian business issues to another domestic business is reported to NAV, the tax authority, as XML. Usually the invoicing program sends the report on its own, and nobody looks at it until something goes wrong. When something does go wrong it shows up in one of two ways:

- a **blocking error**, which means the invoice was not reported at all;
- a **warning**, which means it was reported with numbers that do not add up.

You only see either one after you send, through a technical user registered with NAV.

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) now reads that report before it is sent. You can drop in an `InvoiceData` file. You can also drop in the `manageInvoice` request from a log, and the checker decodes each Base64 invoice inside it. Everything runs in your browser, and nothing is sent to NAV or to us.

## What it checks

NAV publishes its interface specification and samples on GitHub under the MIT licence. Section 3.3.2 of the specification lists 80 blocking error codes, each with the condition that triggers it. We went through them and picked every one that can be checked from the file alone. Each finding names the NAV code it stands for. Among them:

- **VAT rates by date.** The 27, 18 and 5% rates, plus the 7 and 12% that the list also accepts. Pre-2013 rates such as 25% are allowed only on modifications. A 0% rate is allowed only on supplies made from 2024. Simplified invoices take a VAT content instead (21.26%, 15.25%, 4.76%) and must not mix it with rates.
- **Codes against the buyer.** A tax-exempt intra-Community supply (KBAET) needs a buyer from another member state, and so does a reverse charge abroad (EUFAD37, EUFADE). Domestic reverse charge needs a Hungarian VAT-registered buyer with a tax number. A private-person customer must not appear with a name, an address or tax data.
- **The exchange rate.** A forint invoice takes 1. EUR must sit between 250 and 600, and NAV lists bands for 12 more currencies. A rate typed per 100 forints, or inverted, falls outside the band.
- **Modifications.** A modifying document needs `invoiceReference`, and its lines need `lineModificationReference` with operation CREATE. It must not reuse the number of the invoice it modifies. The request's own operation (CREATE, MODIFY or STORNO) must agree with all of that.
- **The e-invoice hash.** When the report is itself the electronic invoice, its SHA3-512 `electronicInvoiceHash` is recomputed and compared.
- **Simpler checks.** Line numbering, the fields a line must carry, own units of measure, and the check digit of every tax number in the file.

It also does the arithmetic behind NAV's warnings: quantity × price, VAT from the net amount, gross, every forint conversion, each VAT-rate row against its lines and the totals against the rows. It uses NAV's own tolerance ("1% of the net price, but no less than 1 unit"), so a rounding difference NAV would let through is not flagged. These come out as warnings, as they do at NAV.

## How we checked it

NAV publishes 30 sample invoice data files: domestic, foreign currency, simplified, aggregate, advance, modifications, batch modifications and an export of a new vehicle. The checker reports nothing on 27 of them. On the other three it reports five findings. We read each one against the file, and each is a real fault in NAV's sample:

- in one file a forint amount has an extra zero (306,800 written as 3,068,000);
- in the same file a reverse-charge row has a net of 600,000, no VAT, and a gross of 500,000;
- two tax numbers fail the check digit (8 digits, weights 9-7-3-1). They are placeholders, while the other samples use valid ones;
- one modification uses `lineOperation` MODIFY, which a later rule (code 60) refuses. The sample is older than the rule.

The API sample has a surprise of its own. The specification says the e-invoice hash is taken over "the BASE64 encoded value of the invoiceData node". All three hashes in NAV's sample match SHA3-512 of the *decoded* XML, and none of them matches the Base64 text. We follow the sample. Anyone writing their own NAV client will want to know this.

Two false alarms turned up on the way and are fixed. The specification's English text spells a unit as "LITRE" while the schema says `LITER`, and we had followed the text. We had also summed VAT across lines that carry no VAT data, which is allowed for advance deduction lines.

We also seeded 27 kinds of fault into the samples, 519 changed files in all, and 518 were caught. The one miss was a tax number that was already wrong before the change. Seeded faults only show that each rule fires on its own fault, because we wrote both the rules and the faults. The real test is a business's own report next to NAV's answer to it, and we have not run that yet.

## What it does not see

It cannot run the checks NAV makes against its own records: whether the invoice number is unique, whether the invoice a modification refers to exists, whether a tax number is registered. It does not read gzip-compressed operations. It does not check product-fee (termékdíj) totals. It does not validate the file against NAV's XML schema yet, because the schema imports a shared file that NAV's repository does not include.

A clean result means the report is consistent and passes the checks NAV publishes. It does not mean NAV will accept it, and it is not tax advice.

The code is MIT licensed: `ventures/einvoice-preflight/hungary-nav.mjs`, with the measurement in `eval/hungary-nav-samples-2026-11-15.md`.
