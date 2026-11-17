# The repair on real files (2026-11-14)

Until this run the arithmetic repair (`repair-ubl.mjs`, `repair-cii.mjs`,
`repair-facturx.mjs`) had been tried only on files this repository wrote. This
run ran it over four public test suites, read from checkouts and not copied
here:

| Checkout | Commit | Licence |
|---|---|---|
| ZUGFeRD/corpus | 84f8d8f | per file (see the repo) |
| ZUGFeRD/mustangproject | 42127fa | Apache-2.0 |
| itplr-kosit/xrechnung-testsuite | 1ce1daf | Apache-2.0 |
| ConnectingEurope/eInvoicing-EN16931 | b17b269 | EUPL-1.2 |

## 1. Unseeded: what the repair did to files that are already right

`node eval/repair-real-files.mjs <checkouts...>`: 529 UBL, CII and Factur-X files
outside the `fail` / `invalid` folders (51 such files skipped). Almost all of them
pass KoSIT's validator or the EN 16931 Schematron, so a repair that changes one
needs a real inconsistency to justify it.

| | before | after |
|---|---|---|
| files changed | **69** | 2 |
| amount due changed | **53** | 0 |
| line nets rewritten | 49 | 2 |
| Factur-X PDFs rewritten | 19 | 0 |

By source, before: ZUGFeRD corpus 18 changed (12 with a new amount due),
Mustang 26 (19), KoSIT 9 (9), CEN 16 (13).

The causes, all in our repair, none in the files:

1. **A line net was rewritten to quantity x price even when the header agreed
   with it.** EN 16931 has no rule that a line net equals quantity x price
   (Peppol's R120 does; XRechnung and the CEN rules do not). KoSIT's insurance
   samples bill gross amounts: net price 67.2244, quantity 1, line net 80.00,
   totals on 80.00. The repair made the line 67.22 and the amount due 184.87
   instead of 220.00. CEN example 1 has a line of 6 x 18.33 stated as -109.98;
   the repair flipped its sign and the total. KoSIT 03.01a writes 245 x 0.1973
   (48.3385) as 48.33; the repair moved it and the total by a cent. **Fix:** when every
   line states a net and the nets add up to the stated sum of line nets (BT-106,
   BR-CO-10), the totals corroborate the nets; the nets are kept and each
   disagreeing line is listed in `skipped` ("check the line's price or
   quantity"). The check INV-012 still reports the line. When BT-106 disagrees
   with the nets, the net is the outlier and is still rewritten.
2. **A tax a cent off taxable x rate was rewritten.** EN 16931 accepts a VAT
   category tax up to one currency unit off (BR-CO-17, BR-S-09: `abs(tax) - 1 <
   round(taxable x rate)`), because sellers round per line. KoSIT's 01.06
   minimal test states 757.41 for 3,986.34 at 19% (757.40). **Fix:** a tax is
   kept when the taxable amount is right and the gap is at most a cent per line
   in that group, said in `skipped`. Further off, it is rewritten as before.
3. **Hungarian VAT in whole forints was rewritten to the filler** (CEN's
   `huf_example_cii`, 18679 for 18678.60). The checks already accepted this
   (`wholeUnitTaxAgrees`, now exported); the repair now does too.
4. **ZUGFeRD EXTENDED sub-invoice lines were summed.** A `GROUP` line repeats its
   details' sum and an `INFORMATION` line counts for nothing; adding them all
   inflated the totals of 15 Mustang files (the ZUGFeRD 2.5 EXTENDED sub-line
   samples, as XML and PDF; 1,500.00 became 3,000.00 in one). **Fix:** a
   CII file with `ParentLineID` or `LineStatusReasonCode` is not recomputed, and
   says why.
5. **XRechnung third-party payments.** KoSIT's extension case 05.01a lists two
   `cac:PrepaidPayment` (BG-DEX-09) that raise the amount due above gross; the
   repair set it back to gross. **Fix:** the amount due is left as written when a
   UBL file has a document-level `PrepaidPayment`.

The two files still changed are not valid as they stand: Mustang's
`line-total-4-decimals.xml` has a line net of 47.0504 (BR-DEC-23 allows two
decimals; the repair writes 47.05) and Mustang's `ubl/BT-128.ubl.xml`, a parser
test, states 200 as the sum of two lines of 1,000 each.

## 2. Seeded: real Factur-X PDFs, rewritten by qpdf, repaired, read back by qpdf

`python3 eval/repair-seeded-facturx.py <corpus> <mustangproject>` (needs
`pip install pikepdf`, qpdf 12.4.2 here). For each of the 179 Factur-X / ZUGFeRD 2
PDFs in the two checkouts that the repair leaves alone (some samples appear in
both), the document tax total (BT-110) in the embedded XML is pushed up by 7.00
and the PDF is written by qpdf twice: once with object streams and a
cross-reference stream, once with a classic xref table. `repair-cli.mjs` then
repairs each, and qpdf opens the result.

| | count |
|---|---|
| seeded PDFs | 358 |
| repaired PDF passes qpdf's syntax check | **358** |
| page count unchanged | 358 |
| attachment read back by qpdf equals the original XML byte for byte | **248** |
| repair declined, file unchanged, reason printed | 110 |
| anything else (a wrong value written) | **0** |

Declined: 66 have header allowances or charges (the CII repair does not recompute
those yet; the UBL one does), 32 have a line with no quantity or net price
(MINIMUM and BASIC WL), 12 have sub-invoice lines (fix 4).

One more fault found on the way: Mustang's GnuAccounting sample starts its XML
with a UTF-8 byte-order mark, and the repair dropped it (`TextDecoder` strips a
BOM by default). The repaired attachment then differed from the original in its
first three bytes. Fixed (`ignoreBOM`), with a test.

## Limits

These are test-suite samples, not a business's own exports; they are the closest
public stand-in. The PDFs were rewritten by qpdf before seeding, so the
incremental update was tested on qpdf's two layouts, not on each producer's own
byte layout (the unseeded run in part 1 did append to the producers' own files,
19 of them, and every one unwrapped back to the repaired XML, but those
repairs were the wrong ones fixed above). veraPDF (PDF/A-3 conformance after the
update) was not run.
