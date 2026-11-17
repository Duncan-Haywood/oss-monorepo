---
title: "Italy's SdI allows a euro on the VAT base, not a cent"
seo_title: "FatturaPA SdI error 00422 and 00421 tolerances from specification 1.9"
date: 2026-11-13
tags: [e-invoicing, italy, fatturapa, einvoice-preflight]
description: "Read from the Agenzia delle Entrate's own specification 1.9: two of our FatturaPA tolerances were wrong, and SdI never checks the document total."
---

Our [e-invoice preflight](../../ventures/einvoice-preflight/README.md) checks
Italian FatturaPA files before they go to SdI, Italy's Exchange System. Until
this week, the arithmetic rules had to be written from vendor summaries,
because agenziaentrate.gov.it refused our build machines. Today it answered,
so we read the specification itself: Allegato A, version 1.9, 191 pages in
Italian, with its English appendix.

Here is what the file-only arithmetic checks look like when read from the
source.

**PrezzoTotale (error 00423).** Quantity times unit price, after the line's
discounts, may differ by up to one cent. We had this right.

**Imposta (error 00421).** The VAT on a summary is compared with
`AliquotaIVA × ImponibileImporto / 100` *after* that product is rounded half
up to the cent, and then a one-cent tolerance applies. We compared against
the unrounded product. On a 0.25 base at 22%, the product is 0.055, which
rounds to 0.06, so SdI accepts an Imposta of 0.07. We flagged it.

**ImponibileImporto (error 00422).** This was the large one. SdI adds up, for
each VAT rate, the line totals, any pension-fund contribution (*cassa
previdenziale*) at that rate and the summary's rounding (*Arrotondamento*).
It then allows **one euro** of difference. We grouped by rate *and* exemption
code (Natura), allowed a cent per line, and skipped the check entirely when
a cassa was present. A file 50 cents off was "rejected" by us and accepted by
SdI. A professional's invoice with a 4% cassa was never checked at all.

**ImportoTotaleDocumento.** The specification gives the document total no
error code at all, and the element is optional. We reported a wrong total as
blocking. It is now a warning, because SdI will not stop the file, though the
buyer's payment run may.

One detail is worth knowing if you work from the English translation: its
error table says the 00422 tolerance is "±1 eurocent", while its own field
text says "±1 euro". The Italian says *euro* in both places.

While we had the table open, we went through all 45 codes. Nineteen more
rejections can be caught from the file alone, and now are. Some examples: a
TD17 reverse-charge self-invoice naming an Italian seller (00473), a TD21 line
at 0% (00474), a linked invoice dated after the document (00418), split
payment on a reverse-charge summary (00420), `XXXXXXX` as the destination code
for an Italian buyer (00313), and SdI's own PEC address as the recipient
(00330). Each finding now carries the SdI code it reproduces. The full map,
including the codes we can't check offline (register lookups, duplicates,
declarations of intent), is in
[`eval/sdi-error-codes-2026-11-13.md`](../../ventures/einvoice-preflight/eval/sdi-error-codes-2026-11-13.md).

We ran the new rules over 50 public FatturaPA files. Every new verdict
matched the specification's text, including some uncomfortable ones. Two
converter test files have a Dutch seller and a Dutch buyer, and SdI takes no
invoice with no Italian party. The Agenzia's own sample FPR03 is two euros off
on its VAT base, past even the generous tolerance. That is a sample of
layout, not a file SdI accepted, and we report what the rule says.

The tool's verdicts are observations, not tax advice and not SdI's
acceptance. What we still lack is one real SdI rejection receipt to compare
against end to end.

The bonus: the schema we had pinned from three GitHub mirrors hashes
byte for byte to the Agenzia's own file. That makes it the official schema,
not just a common copy.
