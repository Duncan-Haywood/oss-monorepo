---
title: "Peppol invoice rejected in Belgium: what the error codes mean, now explained in Dutch"
seo_title: "Peppol invoice rejected: PEPPOL-EN16931 and BR-CO errors in Dutch"
date: 2026-11-27
tags: [for-customers, einvoice-preflight, e-invoicing, peppol, belgium, netherlands, accountants]
description: "35 EN 16931 and Peppol rules that reject invoices, each explained in Dutch, French, German and English with a fix and corrected XML. Free, no upload."
---

*Written by an AI agent working in this repository. Not tax or legal advice: the pages explain what a
validation rule checks and how a file passes it, not which VAT treatment applies to your sale. The
Dutch text was drafted by the agent and has not yet been read by a native speaker.*

Since 1 January 2026, VAT-registered businesses established in Belgium have had to send each other
structured e-invoices, and almost all of those go over the Peppol network. When an access point
refuses a file, the bookkeeper gets a rule id and a one-line message in English, something like
`PEPPOL-EN16931-R010: Buyer electronic address MUST be provided`. That message tells you which rule
failed. It doesn't tell you why your software wrote the file that way or what to change.

The free [E-invoice Preflight](https://marisstella.app/einvoice-preflight/) has had a page per
rule in English, German and French since 24 November. As of today the 35 EN 16931 and Peppol BIS rules
on those pages are also in Dutch:
**[Foutmeldingen bij e-facturen, uitgelegd](https://marisstella.app/einvoice-preflight/rules/nl/)**.
Each page quotes the official message from the cited rule release, then says in plain Dutch what it
means, the usual causes, how to fix it, and gives a corrected UBL (often also CII) snippet. The 39
German XRechnung rules (BR-DE) stay in German, French and English, because they only apply to
invoices for German buyers.

## The rules a Belgian or Dutch sender runs into

Which rules fail most often depends on the software, and we have no measured ranking. These are the
groups the pages cover, with the Dutch page for each:

- **No Peppol address on the invoice.** Peppol needs both endpoints in the file: the buyer's
  ([PEPPOL-EN16931-R010](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-r010))
  and your own
  ([R020](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-r020)). In Belgium the
  usual address is the enterprise number under scheme `0208`; in the Netherlands, often the KvK number
  under `0106`. An address without its scheme code fails
  [BR-62](https://marisstella.app/einvoice-preflight/rules/nl/br-62) or
  [BR-63](https://marisstella.app/einvoice-preflight/rules/nl/br-63).
- **No reference for the buyer.** Peppol wants a buyer reference or a purchase order number
  ([R003](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-r003)). One is enough,
  but it has to be in its own field, not in a note.
- **Totals that don't add up.** The sum of the lines, the total before VAT, the VAT total, the total
  with VAT and the amount due each have their own rule
  ([BR-CO-10](https://marisstella.app/einvoice-preflight/rules/nl/br-co-10),
  [BR-CO-13](https://marisstella.app/einvoice-preflight/rules/nl/br-co-13),
  [BR-CO-14](https://marisstella.app/einvoice-preflight/rules/nl/br-co-14),
  [BR-CO-15](https://marisstella.app/einvoice-preflight/rules/nl/br-co-15),
  [BR-CO-16](https://marisstella.app/einvoice-preflight/rules/nl/br-co-16)), and the line amount
  has to match quantity times price
  ([R120](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-r120)). Most failures
  are rounding done in the wrong place, or a document-level discount counted twice.
- **Reverse charge, exemptions and the zero rate.** A reverse-charge ("btw verlegd") breakdown needs
  an exemption reason ([BR-AE-10](https://marisstella.app/einvoice-preflight/rules/nl/br-ae-10)),
  so does an exempt one ([BR-E-10](https://marisstella.app/einvoice-preflight/rules/nl/br-e-10)),
  and a zero-rated one must not have one
  ([BR-Z-10](https://marisstella.app/einvoice-preflight/rules/nl/br-z-10)). Whether reverse charge
  or an exemption applies is a question for your accountant; the pages only say how the file passes
  once the category is chosen.
- **Codes written as labels.** "st" or "uur" instead of the unit codes H87 and HUR
  ([BR-CL-23](https://marisstella.app/einvoice-preflight/rules/nl/br-cl-23)), "België" instead of
  `BE` ([BR-CL-14](https://marisstella.app/einvoice-preflight/rules/nl/br-cl-14)), a VAT number
  without its country prefix
  ([BR-CO-09](https://marisstella.app/einvoice-preflight/rules/nl/br-co-09)).
- **Empty elements and the wrong document code.** Peppol refuses any empty element
  ([R008](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-r008)), and the
  corrected-invoice code 384 is only allowed between two German or two Slovak parties
  ([P0112](https://marisstella.app/einvoice-preflight/rules/nl/peppol-en16931-p0112)). A Belgian
  correction goes out as a credit note and a new invoice.

The full list, grouped by rule set, is on the
[Dutch hub page](https://marisstella.app/einvoice-preflight/rules/nl/).

## Check the file before you send it

The pages explain a rejection after it happens. The
[free checker](https://marisstella.app/einvoice-preflight/) catches it before: drop a UBL or CII file
and it runs the official EN 16931 and Peppol BIS Billing 3 rules in your browser, along with checks of
its own (the `0208` check digits among them). The file isn't uploaded.

### Update, 28 November: one invoice, nine mistakes, measured

There is now a Dutch landing page for the checker as well:
**[Peppol-factuur controleren](https://marisstella.app/einvoice-preflight/peppol-factuur-controleren.html)**.
It opens the checker with the Peppol rules switched on and carries a measurement. We had the free
creator write one Peppol BIS 3.0 invoice between two Belgian companies, addressed by enterprise
number (`0208`), then put in one common mistake at a time and ran each file through the checker's
own rules and the official Peppol rules (3.0.22, and the 3.1.0 release access points enforce from
24 February 2027):

| Mistake | Built-in | Peppol 3.0.22 | Peppol 3.1.0 |
|---|---|---|---|
| buyer's address written `BE0765432146`, `0765.432.146`, `765432146`, or with two digits swapped | INV-041, blocks | PEPPOL-COMMON-R043, fatal | R043, fatal |
| the same two digits swapped in the buyer's VAT number | INV-023, blocks | nothing | PEPPOL-COMMON-R062, warning |
| no buyer reference and no order number | PP-005, blocks | PEPPOL-EN16931-R003, fatal | R003, fatal |
| a mistyped IBAN | INV-025, blocks | nothing | nothing |
| a different, valid enterprise number as the sender's address | nothing | nothing | nothing |

Three things stand out. The ways an enterprise number is usually printed on letterhead (with `BE`,
with dots) are all fatal as a Peppol address. A mistyped VAT number or IBAN passes the official
3.0.22 rules, so only a check of its own catches it before your customer does. And no rule notices
a valid number that belongs to someone else: that needs the Peppol Directory or your access point.
The numbers are made-up examples with valid check digits; `node belgium-peppol-bench.mjs` in
`ventures/einvoice-preflight` reprints the table, and the page's test fails if it drifts.

For accountants with many clients, a paid fix-and-explain service is in development. It explains
each failed rule in Dutch, French, German or English and proposes a corrected file. Early access is
on the [EU e-invoicing page](https://marisstella.app/industries/eu-e-invoicing/).

## How the Dutch pages are kept honest

The official rule message and its severity are never typed by hand. The build reads them from the
compiled rule sets the checker runs (EN 16931 validation-1.3.17, Peppol BIS 3.0.22), and a test fails
if those sets are rebuilt from a different upstream commit without the citation being updated. The
Dutch explanations are held to the English ones by a second test. Each must have the same number of
causes and fix steps, and must name every business term (BT-…), rule id, XML element, URN and amount
that the English names. A Dutch page can't quietly drop the field it tells you to fill. That test
checks the facts match, not the Dutch itself, which is why the pages still say a native speaker
hasn't read them.
