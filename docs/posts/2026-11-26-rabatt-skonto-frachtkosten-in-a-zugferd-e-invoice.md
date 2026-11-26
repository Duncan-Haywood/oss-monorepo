---
title: "Rabatt, Skonto and Frachtkosten: where a discount goes when your PDF invoice becomes an e-invoice"
seo_title: "Rabatt, Skonto and freight in a ZUGFeRD or XRechnung e-invoice"
date: 2026-11-26
tags: [for-customers, einvoice-preflight, e-invoicing, zugferd, factur-x, xrechnung, germany, france, accountants]
description: "A discount below the item table is not a line, a Rabatt column is a line allowance, Skonto is not a discount, and a discount across two VAT rates needs splitting. How our PDF converter reads them."
---

Most small firms in Germany and France still send invoices as a PDF from Word,
Excel or an old invoicing program. Plenty of them have a block like this under
the item table:

```
Zwischensumme              2.191,80 €
abzgl. 3 % Rabatt            -65,75 €
zzgl. Anfahrtspauschale       35,00 €
Nettobetrag                2.161,05 €
zzgl. 19 % USt               410,60 €
Rechnungsbetrag            2.571,65 €
```

A PDF lets you print anything there. An e-invoice (XRechnung, or ZUGFeRD /
Factur-X in the EN 16931 profile) does not: each of those lines has a set
place, and a wrong place gives an invoice whose totals do not add up.

## Where each line goes in EN 16931

- **The discount and the travel charge are document-level allowances and
  charges.** In EN 16931 they are groups BG-20 (allowance) and BG-21 (charge),
  separate from the invoice lines. Each has an amount, a reason ("3 % Rabatt",
  "Anfahrtspauschale") and **its own VAT category and rate**. Only the VAT
  group with that rate is changed by them.
- **There are two net totals.** "Zwischensumme" is the sum of the lines (BT-106).
  "Nettobetrag" is that sum minus the allowances plus the charges. It is the
  amount VAT is charged on (BT-109). A converter that treats the first one as
  the invoice's net total will produce VAT and a grand total that differ from
  your PDF.
- **A discount across two VAT rates has to be split.** Suppose you give 10 %
  off an invoice with 19 % work and 7 % goods. One allowance can carry only
  one rate. So the e-invoice needs one allowance at 19 % and one at 7 %, each on its
  own share. The PDF usually prints a single "10 % Rabatt" line. Nothing on the
  page says how it divides, so a program should not invent that division.
- **Skonto is not a discount on the invoice.** "2 % Skonto bei Zahlung bis …"
  is a condition of payment: the invoice amount stays the same and the buyer may
  pay less if they pay early. It belongs in the payment terms, not in an
  allowance that lowers the total. Down payments already received
  (Abschlagszahlung, acompte) are a third thing again: they reduce the amount
  due, not the invoice total.

## What our PDF-to-e-invoice converter does with them

The [e-invoice workspace for accountants](https://marisstella.app/industries/eu-e-invoicing/)
(early access, not open to sign-ups yet) has a "PDF to e-invoice" screen. You
drop in a plain PDF invoice. It shows every value with the line of the PDF it
was read from. You confirm the marked ones and download a Factur-X / ZUGFeRD,
XRechnung or UBL file that has passed the checker. No AI model is involved,
and nothing is guessed. As of today it also reads the block above:

- A **discount** line (Rabatt, Nachlass, remise, rabais, discount) or a
  **charge** line (Versand, Fracht, Verpackung, Anfahrt, Zuschlag, frais de
  port, shipping) between the item rows and the total becomes an allowance or
  charge. Its reason is your PDF's own wording.
- Each one is checked against **both** printed sums: the rows have to add up
  to the Zwischensumme, and the Zwischensumme minus discounts plus charges has
  to equal the Nettobetrag.
- **The VAT rate is proven, not assumed.** If the invoice has one rate, the
  discount takes it. If it has several, the converter tries every assignment
  and keeps a rate only when exactly one of them makes each rate's printed VAT
  come out to the cent. If none does (the usual sign of a discount split across
  rates) or more than one does, it leaves the rate empty and tells you to set
  it. Each discount and charge is marked for you to confirm. The download stays
  locked until the e-invoice carries the same net, VAT and total as your PDF.
- **Skonto, escompte and down payments are never read as a discount.**
- **Invoices over several pages** now read past "Zwischensumme Seite 1" and
  "Übertrag". The converter checks each carried-forward sum against the rows
  above it. Before this change, a two-page invoice was read only to the bottom
  of page 1, and the page subtotal was taken as its total.

We tested it on three invoices of our own: a German tiling invoice with a
discount and a travel charge, a French plastering invoice with a *remise*
between Total HT and Net HT, and a two-page German landscaping invoice with
12 rows at 7 % and 19 % plus freight. Each was printed to PDF twice, by Chromium
and by LibreOffice, which lays out tables quite differently. LibreOffice wraps
labels round their amounts, puts the rate and the amount in one cell, and
stacks the seller and buyer blocks. All six PDFs read completely, and the
Factur-X built from each passes the checker. These are our own test files, so they
show the reading works on those layouts. They do not show how often it works on
the invoices real firms send. We have not measured that yet.

## A discount on one item row

Wholesalers' and tradespeople's invoices often give the discount per row, in a
column of its own:

```
Pos. Bezeichnung        Menge  Einzelpreis  Rabatt   USt   Gesamt
1    Kupferrohr 15 mm   24 m      8,40 €    10 %    19 %  181,44 €
3    Montage Heizkörper  8 Std.  62,00 €            19 %  496,00 €
4    Thermostatkopf      6 Stk   24,90 €   -9,40 €  19 %  140,00 €
```

In EN 16931 a discount like this is a **line allowance** (group BG-27). It sits
on the line, takes the line's VAT rate, and the line's net (BT-131) is quantity
x price less the allowance. A converter that ignores the Rabatt column sees
24 x 8,40 = 201,60, not 181,44, and either drops the row or prints the wrong
amount.

Since 26 November the converter reads these rows. When the table header has a
Rabatt, Nachlass, Remise or Discount column, a row whose quantity x price is not
its amount is accepted when **exactly one** discount makes it so, to the cent.
That discount is either a percent (201,60 less 10 % is 181,44) or an amount
(149,40 less 9,40 is 140,00). On a row with two percents, the arithmetic decides
which one is the discount and which is the VAT rate. If no reading fits, or two
do, the row is left out and the totals check says a row is missing, so nothing
is guessed. Each row's sum is shown beside it, and the e-invoice carries the
discount as a line allowance with your column's name as its reason. We tested
this on one plumbing invoice of our own, printed by Chromium and by LibreOffice.
Both read completely, and the Factur-X built from each passes the checker. We
have not measured it on real firms' invoices yet.

**Not done yet:** changing a row's discount on the convert screen (today you
see it in the row's note), a discount printed on its own line under a row, a
description that breaks across a page, and scanned PDFs (no text layer).

The free [e-invoice preflight](https://marisstella.app/einvoice-preflight/)
checks an XRechnung, ZUGFeRD or Factur-X file you already have, including its
allowance and charge arithmetic, in your browser.

*This post explains how EN 16931 structures an invoice and what our software
does. It is not tax advice: whether a discount reduces the VAT you owe, and how
Skonto is treated when it is taken, are questions for your tax adviser.*
