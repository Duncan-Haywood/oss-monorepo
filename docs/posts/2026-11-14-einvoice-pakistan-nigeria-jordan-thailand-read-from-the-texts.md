---
title: "Four e-invoicing pages rewritten from the tax authorities' own texts: Pakistan, Nigeria, Jordan, Thailand"
seo_title: "Pakistan, Nigeria, Jordan, Thailand e-invoicing rules from the source"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Pakistan covers every sales tax registrant, Thailand's e-Tax Invoice is a choice, Jordan's regulation sets no date, and Nigeria's portal names UBL, not Peppol."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has a page on each country's e-invoicing rules. Four of them, Pakistan, Nigeria, Jordan and Thailand, were written from vendor blogs and search summaries. Today we went looking for each tax authority's own documents. Three of them answered from a cloud runner and one half answered. Here is what changed.

## Pakistan: every registered person, not just big retailers

The old page said Pakistan's FBR integration started with "Tier-1 retailers". That was true years ago. The Federal Board of Revenue's own notifications say more:

- **S.R.O. 69(I)/2025** (29 January 2025) rewrote Chapter XIV of the Sales Tax Rules. Every invoice, debit note and credit note goes through software linked to the FBR. The FBR sends back a unique invoice number, and the invoice prints a QR code built from it. The rule lists 26 things an invoice must show, from the HS code to the "further tax".
- **S.R.O. 1413(I)/2025** (1 August 2025) brought in all sales tax registered persons in seven groups. Public companies, companies with sales over PKR 1 billion and importers had to start by 1 September 2025, and everyone else by 1 December 2025.
- **Sales Tax General Order 01 of 2026** (30 March 2026) lets you cancel or edit an invoice issued by mistake within 72 hours. After that you need the Commissioner's approval.

Two claims from the blogs did not hold up. The "60 percent input tax cut" penalty is not in the rules. The rules point to section 33 of the Sales Tax Act, and the page now says so. News reports also say a later notice, S.R.O. 1852(I)/2025, moved the last deadline to 31 December 2025. We could not find that notice on the FBR's download server, so the page lists it as reported, not read.

## Thailand: the law says you choose

Thailand's page used to say "voluntary, according to the sources read". It can now quote the text. Clause 10 of the Revenue Department's notification of 7 June 2023 (Royal Gazette, 12 July 2023) says a VAT-registered business "has the right to choose" electronic or paper. A business that picks electronic applies on form BO.01, waits for the Director-General to list it, and sends its invoice data by the 15th of the next month.

Choosing electronic now pays in places, though. Notification No. 470, published on 28 October 2026, lets an individual claim the income tax exemption of up to THB 200,000 for rooftop solar only with an e-Tax Invoice that names the buyer's tax ID. A paper invoice does not count for that relief.

## Jordan: the regulation sets no date

Jordan's tax department hosts its invoicing regulation (No. 34 of 2019, as amended in 2023) and the minister's instructions. The PDFs' text comes out as gibberish, because they use an old Arabic font encoding, so we read the page images instead. What they say:

- Every sale of JOD 1 or more needs an invoice. An e-invoice counts when it comes from the national system (JoFotara) or from software linked to it.
- The rollout follows "the timetable prepared for this purpose". The text itself gives no date. The April 2025 start that every guide quotes comes from an amended Regulation No. 2 of 2025. That regulation is not on the department's page, so it stays marked as reported.
- Small shops, bakeries, greengrocers, home businesses and others with sales under JOD 75,000 are exempt. So are licensed crafts under JOD 30,000 and bakeries that sell only bread, under JOD 150,000.

One blog claim was the wrong way round. The old page said buyer details are "not required below JOD 10,000". The regulation actually says the buyer's name is needed on credit sales, and that above JOD 10,000 the seller must prove the buyer received the invoice. The page is fixed.

## Nigeria: UBL, and no mention of Peppol

The Nigeria Revenue Service's main site answered our runner with a CAPTCHA, and we did not try to get around it. Its e-invoicing portal did answer. That portal lists **UBL** and ISO 20022 as its standards and never mentions Peppol, so "Peppol-aligned" is gone from the page. Updates dated 13 December 2025 add an `invoice_kind` field (B2B, B2G or B2C) and state and local government fields. A B2B buyer with no TIN can be identified by an `RN-` incorporation number. Taxpayers can now also report directly with their own keys.

The rollout dates come from the NRS notice of February 2026, as KPMG Nigeria copied its table. Medium taxpayers (1 to 5 billion naira) go live on 1 July 2026, and emerging taxpayers (under 1 billion) on 1 July 2027. The page says plainly that it is quoting KPMG's copy.

## What it means for the tool

The checker itself did not change. None of these four countries uses EN 16931, so a clean result on a UBL file is still only a check of the numbers. The mandates table, the [deadlines page](https://marisstella.app/einvoice-preflight/e-invoicing-deadlines-2027.html) and the calendar feed now carry the corrected dates (126 milestones in 65 countries). Each page has a test that pins the facts we read and keeps the unread items marked as reported. The notes, with every quote, are in `ventures/einvoice-preflight/eval/mandate-primary-sources-pk-ng-jo-th-2026-11-14.md`.
