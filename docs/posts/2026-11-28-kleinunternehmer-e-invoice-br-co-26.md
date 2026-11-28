---
title: "Kleinunternehmer e-invoices: a tax number alone fails BR-CO-26, and our creator let it through"
seo_title: "E-Rechnung Kleinunternehmer: BR-CO-26 and the § 19 mistakes, measured"
date: 2026-11-28
tags: [for-customers, einvoice-preflight, e-invoicing, xrechnung, zugferd, germany, kleinunternehmer]
description: "German small businesses under § 19 UStG need not issue e-invoices. Those who send one anyway hit BR-CO-26 with a Steuernummer alone. Eight mistakes, measured."
---

Germany's small-business scheme (Kleinunternehmer, § 19 UStG: at most 25,000
euro of turnover last year and 100,000 euro this year) has a simple
e-invoice position. Since 1 January 2025 these businesses must be able to
*receive* e-invoices, and an e-mail inbox is enough (BMF FAQ, question 12).
They never have to *issue* one: § 34a UStDV, last sentence, lets a § 19
invoice always go as an "other invoice", on paper or as a plain PDF (BMF
FAQ, question 4). We read
[§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html),
[§ 19 UStG](https://www.gesetze-im-internet.de/ustg_1980/__19.html) and the
[BMF FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
directly on 2026-11-28.

Some customers and portals still accept only XRechnung or ZUGFeRD. So we
took the free creator's example invoice, turned it into a § 19 invoice (no
VAT ID, a Steuernummer, every line in VAT category E at 0 % with the note
"Kleinunternehmer gemäß § 19 UStG"), wrote it as XRechnung (CII) and as
ZUGFeRD EN 16931 (CII), and checked it with the official CEN and KoSIT
Schematron.

**It failed, with nothing else wrong.** Rule BR-CO-26 wants a seller
identifier (BT-29), a legal registration id (BT-30) or a VAT ID (BT-31). A
tax number (BT-32) does not count. That is exactly what a Kleinunternehmer
without a VAT ID or a trade register entry has. Our creator wrote that file
without complaint, and our built-in checks passed it; only the official
rules caught it. The creator now refuses it and asks for a seller
identifier (a trade register number, or the supplier number the customer
gave you), and the creator form has a field for it. The built-in checks do
not report BR-CO-26 yet, so check with the official rules switched on (the
German page's links do that).

With a seller identifier added, the clean invoice passes. Then one mistake
at a time, as XRechnung (the ZUGFeRD file gave the same result on every
row except one):

| Mistake | Official rules |
|---|---|
| tax number only, no seller identifier | BR-CO-26 |
| no § 19 note (BT-120) | BR-E-10 |
| "0 %" as the standard rate (category S) | BR-S-05 |
| category Z (zero rated) instead of E, no note | passes |
| category Z instead of E, with the note | BR-Z-10 |
| neither tax number nor VAT ID | BR-E-02, plus BR-DE-16 on the XRechnung only |
| tax number in the VAT ID field | BR-CO-09 |

The row to remember is the one that passes. Category Z means a taxable
supply at a zero rate; the § 19 scheme is an exemption, category E. No
validator can tell which one you meant, so a Z invoice with no note goes
through every rule and still describes the wrong tax treatment.

The full table, the legal points with their sources and the questions
people ask are on the German page,
[E-Rechnung für Kleinunternehmer](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/e-rechnung-kleinunternehmer.html).
The measurement is `kleinunternehmer-bench.mjs` in the
[source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/einvoice-preflight),
and the page's test fails if a change to the creator or the checker moves
any result. It is an observation about generated files, not tax advice:
whether § 19 applies to you is a question for your tax adviser.
