---
title: "France's e-reporting file (Flux 10): what the official controls miss"
seo_title: "France Flux 10 e-reporting: checking the file before the PPF"
date: 2026-11-17
tags: [einvoice-preflight, ventures]
description: "E-Invoice Preflight now reads France's Flux 10 e-reporting file and runs the PPF's controls offline. A 20% VAT line with 0.00 VAT passes all 150 of them."
---

France's e-invoicing reform has two halves. The part everyone talks about is the e-invoice: from 1 September 2026, domestic B2B invoices travel between approved platforms (PA) as Factur-X, UBL or CII. The other half is **e-reporting**. The sales that are not domestic B2B e-invoices still have to reach the tax administration's platform (PPF): invoices to or from businesses abroad, sales to consumers, and, where VAT is due when the money comes in, the payments. The platform sends them as a "Flux 10" file.

[E-Invoice Preflight](https://marisstella.app/einvoice-preflight/) now reads that file. Drop it on the page and it says what kind of report it is, the period, the declarant and the totals per VAT rate. Tick "official Schematron" and it also runs the PPF's own controls, as FNFE-MPE publishes them, in your browser. The file never leaves the page.

## Four reports in one file

A Flux 10 file has a `Report` root, a `ReportDocument` header (who sends it, for which business, initial or corrective) and then one of two bodies:

- a **transactions report**, which holds international B2B invoices one by one (10.1) and B2C and other sales summed per day, category (goods, services, not taxable in France, margin scheme) and VAT rate (10.3);
- a **payments report**, which holds payments received on those invoices (10.2) and on those daily sales (10.4).

FNFE-MPE, the French e-invoicing forum, publishes the XSD and a Schematron for it in its France_RFE repository. That Schematron has 150 checks under 36 control codes, the codes the PPF's specification (Annexe 7, v1.8) uses: G1.53 for totals, G6.28 for a foreign buyer's missing id, G1.68 for a bad category. Those codes are what a platform's rejection will quote, so the tool shows them as they are, with FNFE's French messages.

## Checked against FNFE's own XSLT

This repository already runs France's invoice rules (BR-FR) and status-message rules (BR-FR-CDV) in plain JavaScript, so they work on any static host. The Flux 10 set went through the same compiler. To check it, each run went through two engines: our plain version, and Saxon-JS running the XSLT that FNFE compiled from the same Schematron.

FNFE publishes no Flux 10 example file, so we wrote three, all made up and all valid against the XSD: a B2C report for ten days in October, two international invoices (one an intra-EU supply, one a credit note against it), and a payments report. Then we broke each one in up to 95 ways: a transmission id with two spaces, a 14-digit time cut to 12, both report bodies at once, a platform id of five characters, a credit note with no earlier invoice, a negative payment, and so on.

The result was **147 of 147 runs with the same control codes on both engines**, counted with repeats, because G1.09 alone is the code of 17 different date checks. All 36 codes fired on some run, and no check was skipped. Making the first example pass found a mistake of ours: we had typed one day's VAT total as 157.30 when its two rates add up to 156.70, and G1.53 caught it.

## What passes all 150 controls

The more useful result is the list of broken files that neither engine flags. There were 25 such runs:

- **Impossible dates.** 30 February, 31 November and hour 25 all pass. The date controls check the shape (eight digits, or fourteen) and that the year is between 2000 and 2099. Nothing checks that the date exists.
- **VAT that is not base times rate.** An invoice subtotal at 20% with 0.00 VAT passes. So does a daily total with 9.00 too much VAT at one rate, as long as the overall VAT total moves with it. G1.53 checks that the subtotals add up to the total. It never checks that each subtotal follows from its base and rate.
- **Check keys.** A SIREN with the wrong Luhn digit passes, because the controls check that it has nine digits. A French VAT number with the wrong key, or one built on another company's SIREN, passes too.
- **Days outside the period.** A day's sales dated 15 November in a report for 1 to 10 October passes.
- **Non-euro blocks.** The totals rule is written for `TransactionsCurrency = 'EUR'`, so a block in dollars is never added up.

The tool's own checks, FR-F10-101 to FR-F10-107, catch each of these. The ones that are a judgment call are warnings, not errors. For example, a daily B2C total is the sum of many receipts, each rounded on its own, so the VAT check allows half a cent per sale counted before it says anything.

Two quirks in the official set are worth knowing too, though we left them alone. A report period whose end date equals its start date is refused (G6.25 wants the end strictly after the start), so a one-day period fails. And every 10.1 invoice must carry a buyer company id (G6.28).

## Limits

These are made-up files. We have not seen a real platform's Flux 10 file or a PPF rejection, so we do not know whether the PPF applies anything beyond these controls. The tool does not enforce the XSD itself. We used xmllint to make sure our seed files were valid. Most businesses never see this file, because their platform builds it. The people who will see it are platform integrators, ERP teams exporting B2C totals, and accountants checking what was reported. They are the readers this is for.

The check is in the [tool](https://marisstella.app/einvoice-preflight/), and the measurement and its full output are in the repository (`ventures/einvoice-preflight/eval/flux10-crosscheck-2026-11-17.md`). It is an offline observation, not a platform's acceptance and not tax advice.
