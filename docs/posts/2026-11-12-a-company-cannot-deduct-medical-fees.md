---
title: "A Mexican company can't claim medical fees: checking CFDI use against the tax regime"
seo_title: "CFDI 4.0 UsoCFDI vs RegimenFiscalReceptor: which uses a regime allows"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "SAT allows 245 of the 483 regime and CFDI-use pairs a receiver could write. The XSD can't tell which ones; E-invoice preflight now checks all of them."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) reads Mexican CFDI 4.0 invoices in the browser and checks them before they go to a PAC for stamping. Until today it checked every code against SAT's published schema. But some combinations of valid codes are still wrong, and the schema can't see them.

## Two fields that depend on each other

A CFDI 4.0 invoice names the receiver's tax regime (`RegimenFiscalReceptor`, for example 601 "General de Ley Personas Morales") and the use the receiver will make of the invoice (`UsoCFDI`, for example G03 "Gastos en general" or D01 "Honorarios médicos"). Both codes come from SAT catalogues, and the XSD lists every valid code. So `UsoCFDI="D01"` passes the schema whoever the receiver is.

SAT's catalogue spreadsheet, catCFDI.xls, carries more than the XSD does. For each regime and each use it says whether a person (a 13-character RFC) or a company (12 characters) may carry it. For each use it also lists the receiver regimes the use is allowed with. Some examples:

- D01 to D10 are personal deductions (medical fees, funeral costs, school fees). A company can't take them.
- G03, general expenses, is not allowed for a receiver in regime 616, "Sin obligaciones fiscales". With 616 the only uses left on an ordinary invoice are G02 (returns and discounts) and S01 (no tax effect).
- A company in regime 610, a foreign resident without a permanent establishment, may only take S01, plus CP01 on a payment.
- CN01, payroll, goes only with regime 605, salaries.

## How many pairs are wrong

We read those columns from [phpcfdi/resources-sat-catalogs](https://github.com/phpcfdi/resources-sat-catalogs), a public-domain SQL copy of SAT's spreadsheet, and counted. Leave out CP01, which is allowed with every regime. A receiver of the right kind could then write 483 regime and use pairs. SAT's table allows 245 of them. The other 238, about half, are pairs the schema accepts and the table rules out.

## The checks

Three new rules, `MX-015` to `MX-017`:

- **MX-015**: the issuer's regime is not one SAT allows for its kind of RFC. An example is 612, business activity for persons, on a company's RFC.
- **MX-016**: the same check for the receiver's regime, or a use the receiver's kind can't take (D01 on a company).
- **MX-017**: the use is not allowed with the receiver's regime. The fix names the uses that are: "with regime 616 the allowed uses are G02, S01."

Each problem gets one finding. A regime that is wrong for the RFC gets `MX-016` and nothing else, because the use list for a regime the receiver can't hold doesn't help anyone. The generic RFCs (general public, foreigners) are left to the existing `MX-014` rule. Findings never repeat the RFC.

## What we measured

- A test goes through all 483 pairs and checks that a finding appears on exactly the 238 the table forbids.
- We planted four new kinds of defect in the four seed invoices: a regime meant for the other kind of RFC, on the issuer and on the receiver; D01 on a company; G03 with regime 610 or 616. All 14 that apply were caught by the rule named for them.
- We ran the new rules on 13 distinct CFDI 4.0 files from the public test folders of CfdiUtils and three phpcfdi libraries, two of them real stamped invoices. They raised no finding.

## What it doesn't do

It doesn't check that the regime matches the one SAT holds for that RFC. That needs SAT's records, which a PAC consults and an offline checker can't. The rule ids are this tool's own, not SAT's CFDI40xxx codes. A clean result is not an acceptance by a PAC or SAT, and none of this is tax advice. Ask the receiver for their Constancia de Situación Fiscal and copy the regime from it.

Try it on the [Mexico CFDI page](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html). The file never leaves your browser.
