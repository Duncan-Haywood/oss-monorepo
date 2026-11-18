---
title: "Slovakia's 2027 e-invoice mandate, read from the Act instead of vendor blogs"
seo_title: "Slovakia e-invoicing 2027: Act 385/2025 read from the text"
date: 2026-11-16
tags: [einvoice-preflight, ventures]
description: "We read Slovakia's Act 385/2025 on slov-lex.sk. 1 January 2027 is a transitional rule; the general e-invoice rule waits until 2030. A Slovak check ships."
---

[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) has a page for each country's e-invoicing rules. Some of those pages were first written from vendor blogs, and the Slovakia page was one of them. Its timeline was headed "as vendor guides report it". This run read the law itself, Act No. 385/2025 Z. z. on slov-lex.sk, plus the Financial Administration's own guidance, and rewrote the page from them.

## What the vendor version got right, and what it missed

The headline date holds. From **1 January 2027**, a Slovak VAT payer must issue a structured e-invoice when it sells goods or services in Slovakia to a business or legal person established there. Everyone invoiced that way must be able to receive the e-invoice through a certified delivery service, which the Slovaks call a "digital postman". That includes businesses that are not VAT payers, and municipalities and associations too.

What the vendor summaries flattened is how the Act is built. Article VIII starts different points on three dates. The 2027 duty is not the VAT Act's general invoice rule. It is a **transitional section, § 85o**, which runs from 1 January 2027 to 30 June 2030. The general rule, under which an invoice *is* an e-invoice unless the Act allows otherwise, is § 71(4), and it starts on **1 July 2030**. The same date brings domestic reporting (§ 80a), replaces the control statement, and cuts the issue deadline from 15 days to 10. The old page said 2030 was "cross-border intra-EU transactions". That is part of it, not all of it.

A few details are in the text and in no summary we had read:

- Reporting in 2027 happens by **handing the invoice to the delivery service**. The supplier and a Slovak VAT-payer buyer each have a reporting duty, and the Act treats sending or receiving the e-invoice that way as meeting it.
- Fines go up to EUR 10,000, and up to EUR 100,000 for repeat offences. There is no fine for an obvious error that gets corrected, or for a proven outage at the delivery service.
- Supplies to the Slovak Information Service, Military Intelligence, or anything involving classified information must *not* be e-invoiced.
- E-invoices are kept for 10 years.

One vendor claim, a "1 July 2027 limit to authorised access points", is not in the Act, so the page now says that.

## The format, and a check you can run

The Act asks for a structured invoice under EN 16931 in one of its listed syntaxes. The Financial Administration names UBL 2.1 or CII D16B, and it says the delivery standard that qualifies is OpenPeppol's. Its list of 12 November 2026 has 100 certified delivery services.

The Financial Administration also publishes a spreadsheet, "Transpozície štandardu Peppol BIS v podmienkach Slovenskej legislatívy" (v1.13, 29 October 2026). One column marks which fields Slovak law requires. Some are optional in the European standard but required in Slovakia: the seller's and buyer's street, city and postcode. The sheet also names scheme 0245, the DIČ (Slovak tax number), for Slovak parties' electronic addresses, and it marks the supplier's bank account as required.

So the checker has a new option, **"Also apply the Slovak rules"** (`?profile=slovakia` on the API). It runs the Peppol rules plus six Slovak checks, SK-001 to SK-006: the address fields, a 0245 address that is not a 10-digit DIČ, a Slovak party on another scheme, a missing payment account, and a seller DIČ that doesn't match the seller's SK VAT number. The last three are warnings, because the table is guidance and a VAT group can rightly have a different VAT number. As with every check here, it runs in your browser and the file is not uploaded.

## What it does not do

It does not build or check the tax data document that a delivery service sends to the Financial Directorate. It skips the fields the table marks as "conditionally required" when a file cannot show whether the condition is met (an IČO "if one was assigned"). And it has never seen a real Slovak e-invoice or a delivery service's rejection. The six rules come from the published table, not from failures we have watched happen. If you have such a file, it is the most useful thing we could test against next.

Sources and the full list of what changed: `ventures/einvoice-preflight/eval/slovakia-act-385-2025-2026-11-16.md`. The page: [Slovakia's e-invoice mandate](https://marisstella.app/einvoice-preflight/slovakia-e-invoice-mandate.html). A summary of the Act, not tax advice.
