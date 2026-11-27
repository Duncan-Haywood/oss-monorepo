# INV-065 in the national readers: FatturaPA, FA(3), Facturae, NAV and ISDOC (2026-11-17)

Follow-up to [`nbsp-amounts-2026-11-17.md`](nbsp-amounts-2026-11-17.md), which put INV-065 (a
number or date holding a no-break space or another space XML does not count as whitespace) into the
UBL and CII readers. Its flagship row noted that the other readers trim with `String.trim()` too.

## What was wrong

`fatturapa.mjs`, `fa3.mjs`, `facturae.mjs`, `hungary-nav.mjs` and `isdoc.mjs` read element text
with `String.trim()`, which also removes U+00A0, U+202F, U+3000, U+FEFF and the other Unicode
spaces. Their schema gates (IT-021, PL-012..017, ES-018..022, HU-027..032) also judge the trimmed
value, apart from a few patterns. So `<ImportoTotaleDocumento>1320.00` + U+00A0 read as 1320 and
the file passed, while SdI, KSeF, FACe/FACeB2B and NAV validate with an XML schema processor, for
which the value is not an `xs:decimal` and the file is rejected.

## The change

- `xmlvalues.mjs`: `xmlValueFindings(tree)` turns `unreadableLeaves` into INV-065 findings whose
  `path` is the leaf's own; `xmlValueFinding(row, path)` is shared with `inspectXmlValues`, so the
  message is the same as the UBL/CII one.
- `checkFatturaPa`, `checkFa3`, `checkFacturae` and `checkNavInvoiceData` report INV-065 after their
  schema gate. NAV's path follows `pathPrefix`, so inside a `manageInvoice` request the finding
  names its operation (`/ManageInvoiceRequest/invoiceOperations/invoiceOperation[1]/invoiceData/...`).
- `parseIsdocInvoice` keeps `xml_values`, so `checkInvoice` reports INV-065 for ISDOC as for UBL.
- The CLI has no reader for these formats, so nothing changes there.

## Method

`eval/nbsp-other-formats.mjs` is `eval/nbsp-amounts.mjs` for the five readers (the leaf walk is now
shared in `eval/xml-leaves.mjs`): each number, date or boolean leaf gets five mutants (trailing
U+00A0, leading U+202F, trailing U+FEFF, trailing U+3000, trailing `&#160;`), and text leaves a
trailing U+00A0 as a control. "Before" is the reader's findings with INV-065 left out. SaxonC-HE
13.1 then checks castability of each original and mutated value (`eval/nbsp-amounts-saxonc.py`).

```
git clone --depth 1 https://github.com/ZUGFeRD/corpus      # fatturaPA/official and fatturaPA/eigor
# ISDOC: data/priklad.isdoc and data/priklad-podepsany.isdoc from github.com/isdoc/dsig-demo (not copied here)
node eval/nbsp-other-formats.mjs --out W examples fixtures/facturae fixtures/hungary-nav corpus/fatturaPA isdoc
python3 -I eval/nbsp-amounts-saxonc.py W      # in a venv with saxonche
```

## Results

36 files: 17 FatturaPA (2 ours, 15 from the Agenzia delle Entrate and eigor samples in the ZUGFeRD
corpus), 6 FA(3) (ours), 1 Facturae (fixture), 10 NAV InvoiceData (NAV's published samples in
`fixtures/hungary-nav`), 2 ISDOC (the ISDOC association's demo files). 2,001 number, date and
boolean leaves; 10,005 mutants.

| reader | mutants | literal space: nothing new said, before | `&#160;`: nothing new said, before | INV-065 names the leaf, after |
|---|---|---|---|---|
| FatturaPA | 2,490 | 1,452 of 1,992 | 136 of 498 | 2,490 |
| FA(3) | 1,190 | 884 of 952 | 5 of 238 | 1,190 |
| Facturae | 280 | 168 of 224 | 1 of 56 | 280 |
| NAV | 3,965 | 2,712 of 3,172 | 21 of 793 | 3,965 |
| ISDOC | 2,080 | 1,664 of 1,664 | 384 of 416 | 2,080 |
| **all** | **10,005** | **6,880 of 8,004** | **547 of 2,001** | **10,005** |

- **Before, 6,880 of 8,004 literal-space copies (86%) drew no new finding at all; after, INV-065
  names the mutated element on all 10,005 copies.**
- Where a literal space did draw something before, it was a schema pattern on that element
  (FatturaPA IT-021 135, NAV HU-030 114, FA(3) PL-015 17, Facturae ES-021 14 on the U+00A0
  variant): it said the value broke a pattern, not why. INV-065 now names the space.
- SaxonC-HE casts all 10,005 originals and refuses all 10,005 mutated values: INV-065 and Saxon
  agree on every row.
- Controls: 1,333 text leaves with a trailing U+00A0, **0 INV-065**. The 36 files draw no INV-065
  unmutated.
- Booleans count: NAV's `completenessIndicator` "false" + U+00A0 is INV-065, as `xs:boolean`
  refuses it too.
- Tests: `xmlvalues-national.test.mjs` (14). The venture suite: 2,707 tests, 0 failed.

## Integrity notes

- The mutants are synthetic, as in the UBL/CII run: no real file with a stray U+00A0 was available.
- The oracle is castability in Saxon, the step a schema processor fails on. The tax authorities'
  own validators were not run (none is reachable from here); "rejected" above is what an XSD
  processor does with such a value, not an observed SdI/KSeF/NAV/FACe rejection.
- Facturae has one file in the corpus here; the government's other samples
  (`eval/facturae-gob-*`) were not re-fetched.
- `xs:dateTime` values (FA(3) `DataWytworzeniaFa`, NAV timestamps) are outside `CASTABLE`, so a
  space there is not INV-065 yet.
