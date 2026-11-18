---
title: "What a Mexican payroll receipt has to add up to"
seo_title: "CFDI nómina 1.2 checker: the totals SAT's filling guide asks for"
date: 2026-11-12
description: "Every Mexican employer stamps a CFDI for each pay. We read SAT's 117-page payroll guide into 8 offline checks and planted 62 faults: all caught."
tags: [einvoice-preflight, mexico, cfdi, nomina, payroll, e-invoicing]
---

In Mexico every pay slip is a tax document. Each time an employer pays a wage, a bonus or a severance, it stamps a CFDI of type N (*nómina*) for that employee, with the Nómina 1.2 complement inside. For a company with 200 staff paid fortnightly, that is about 4,800 stamped receipts a year. A PAC (the authorised stamping service) checks some rules before stamping, and SAT reads the receipts to prefill each worker's annual return. A wrong total can mean a rejected stamp or a wrong prefilled return.

[einvoice-preflight](../../ventures/einvoice-preflight/) already read CFDI 4.0 invoices and payment receipts. This run added payroll, working from SAT's own *Guía de llenado del comprobante del recibo de pago de nómina y su complemento*. That is a 117-page PDF, which we fetched from SAT's site. Most of it says which field holds what, and in which cases. The rules that fit in a checker come down to eight groups:

- **The shell.** One concept, `84111505`, quantity 1, unit `ACT`, description exactly "Pago de nómina". Its value is total perceptions plus other payments, and its discount is total deductions. Payment form 99, method PUE, no tax nodes: the ISR withheld is a deduction with code 002, not a tax line. The receiver is a person, and the use is CN01. (The guide says P01, the 3.3 value, which the 4.0 catalogue has retired.)
- **Perceptions by kind.** Codes 022, 023 and 025 (seniority premium, separation, indemnity) count toward `TotalSeparacionIndemnizacion`, and 039 and 044 toward retirement. Every other code is wages. Each of those totals, plus taxed and exempt, must match the lines. Overtime needs its hours, and a disability subsidy needs its disability days, with amounts that agree.
- **Deductions.** `TotalImpuestosRetenidos` is the 002 lines only, and it must be left out when there are none.
- **Other payments.** Employment subsidy needs the subsidy owed, and that must be at least what was paid. A subsidy owed but not paid in cash is entered as 0.01, a workaround the guide spells out in its Appendix 5. A refunded annual balance has its own year rule.
- **Periods and employment data.** Ordinary payrolls cannot use frequency 99, and extraordinary ones must. An employment contract needs the employer's social-security registration, and that brings five more fields with it. Seniority cannot be longer than the job. CURP and CLABE check digits are verified.

**What we measured.** We could not find a real payroll file in any public CFDI test folder we searched, so we built two made-up ones: an ordinary fortnight, and a leaving pay with overtime, disability, severance, subsidy and a refunded balance. Neither draws a finding. We then planted 39 kinds of fault that the guide calls wrong, and the checker caught all 62 that applied to one file or the other, each by the rule named for it. Against `xmllint` on SAT's real `nomina12.xsd`, 3,638 mutated files got the same valid-or-not verdict from both. Two things turned up along the way. The guide's own sample bank account fails the CLABE check digit. And SAT's generic CURP for a foreign woman (`XEXX010101MNEXXXA8`) cannot satisfy the usual CURP digit rule, so both generic CURPs are let through as written.

**What it does not do.** It does not check whether the ISR withheld or the subsidy owed is right; that is payroll arithmetic under the income tax law, not a filling rule. It does not look up RFCs or CURPs in SAT's or RENAPO's records, and it has not been compared with a real PAC rejection. If you run payroll in Mexico and can share a de-identified receipt your PAC rejected, that is the comparison this tool needs next.

The checker runs in the browser on the [Mexico CFDI page](https://marisstella.app/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html), where a third sample button loads a payroll receipt with five planted faults, and it runs from the command line. It is MIT licensed. It is not payroll or tax advice.
