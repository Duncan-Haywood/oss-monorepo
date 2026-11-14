---
title: "Is e-invoicing mandatory in Taiwan? The law says no, and Oman's dates are now settled"
seo_title: "Taiwan eGUI and Oman Decision 189/2026: e-invoicing rules read from the law"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Taiwan's VAT Act makes the e-invoice one of five lawful invoice kinds, with a 7-day or 2-day upload deadline. Oman's Decision 189/2026 sets 1 April and 1 October 2027."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has a page for each country's e-invoicing mandate. Two of them, Taiwan and Oman, had "the sources disagree" on the basic question. Today both legal texts answered from a cloud runner, so we read them.

## Taiwan: optional, with a deadline once you choose it

Several vendor guides say every tax-registered business in Taiwan has had to issue electronic Government Uniform Invoices (eGUI) since 1 January 2021. Other guides call it optional. The law agrees with the second group.

- The VAT Act, Article 32(4), allows three ways to produce a uniform invoice: printed by the government, self-printed with approval, or issued electronically.
- The Regulations Governing the Use of Uniform Invoices, Article 7, list five kinds of invoice: triplicate, duplicate, special, cash-register and electronic.
- The one firm duty in the Regulations is for a foreign seller of electronic services to individuals in Taiwan that has no fixed place there. That seller must issue cloud invoices (Article 7-1).

Once a business issues e-invoices, the rules get strict. Since 1 January 2025, Article 32-1 of the Act makes it upload each invoice to the Ministry of Finance platform within the time the Ministry sets. The Ministry's table, printed in the Executive Yuan Gazette on 12 December 2024, sets that time:

- **7 days** when the buyer is a business;
- **2 days** when the buyer is not;
- counted from the day after the invoice, correction, voidance or credit note, and not extended over a weekend.

Many guides say "48 hours" for consumer sales. The table says two days, counted from the next day, which can be up to 72 hours. A late or untrue upload can be fined TWD 1,500 to 15,000 under Article 48-2, and the fine can be repeated.

## Oman: 1 April and 1 October 2027

Oman guides give two different timetables: an older one (August 2026, February 2027, August 2027) and a newer one under Decision 189/2026. The decision's Gazette text settles it. It was issued on 3 August 2026 and published in Official Gazette issue 1660 on 9 August. It takes effect:

- on **1 April 2027** for taxable persons whose annual supplies exceed OMR 5 million;
- on **1 October 2027** for everyone else.

It requires a tax invoice in an approved, secured electronic format, with a unique number, issued **within 15 days**. The Tax Authority will announce the licensed providers, and it can exempt a taxpayer that asks with good reasons and pays on time.

What the decision does *not* say matters just as much. It names no format and no network: Fawtara, Peppol, PINT-OM and the 2026 pilot of about 100 taxpayers come from guides, not from the text. The page now separates what was read from what is only reported.

## Fixed on the way

The Oman page still said our checker gets 4 of OpenPeppol's 49 Omani example files wrong. That was true until 12 November, when three-decimal baisa amounts were fixed, and all 49 pass now. The hub table also said the tool had no PINT-OM rules, which stopped being true the same day. Both now match the code.

The hub table, the JSON and calendar feeds, the [2027 deadlines page](https://marisstella.app/einvoice-preflight/e-invoicing-deadlines-2027.html) and the which-mandate-applies tool are all rebuilt from the corrected rows. New tests pin each fact read from the law, so a later edit can't quietly reintroduce "48 hours". Notes and sources: `ventures/einvoice-preflight/eval/mandate-primary-sources-taiwan-oman-2026-11-14.md`.

Not legal or tax advice: these are our readings of public texts, and they change. Check with the tax authority before relying on them.
