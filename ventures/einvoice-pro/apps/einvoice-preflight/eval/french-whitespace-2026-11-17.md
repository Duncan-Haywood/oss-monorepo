# The French sets on the plain route, checked against SaxonC-HE (2026-11-17)

Follow-up to [`cius-whitespace-2026-11-17.md`](cius-whitespace-2026-11-17.md), whose "Not
done" left the French plain-only sets (BR-FR on UBL and CII, the EXTENDED-CTC-FR and Factur-X
EXTENDED bases, BR-FR-CDV on CDAR status messages, the Flux 10 Annexe 7 controls) out
"because SchXslt has to compile their `.sch` first". It does not: FNFE-MPE's France_RFE
repository ships each set compiled, in a `2xslt/` folder beside the `.sch` (and
`Flux10/Flux10.xslt`), the same stylesheets the earlier Saxon-JS cross-checks ran
(`br-fr-crosscheck`, `cdar-crosscheck`, `extended-base-crosscheck`, `flux10-crosscheck`).

## Results

**BR-FR, EXTENDED-CTC-FR, Factur-X EXTENDED and BR-FR-CDV: 0 rule-id differences from SaxonC
on every copy SaxonC ran to the end; the plain route raises SaxonC's ids on all 100
unmutated files; XML-VALUE-01 names the field on all 43 copies SaxonC stops on.**

| sets run (file kind) | files | mutants | ids differ, fontoxpath's own whitespace | ids differ, with the rewrite (what the page runs) | SaxonC aborts | XML-VALUE-01 names the field |
|---|---|---|---|---|---|---|
| BR-FR (UBL) | 8 | 134 | 28 | **0** | 0 | - |
| BR-FR (CII, Factur-X EN16931/BASIC WL) | 18 | 304 | 64 | **0** | 1 | 1 |
| EXTENDED-CTC-FR + BR-FR (UBL) | 5 | 85 | 36 | **0** | 12 | 12 |
| EXTENDED-CTC-FR + BR-FR (CII) | 5 | 84 | 16 | **0** | 12 | 12 |
| Factur-X EXTENDED + BR-FR (CII) | 5 | 83 | 12 | **0** | 18 | 18 |
| BR-FR-CDV (CDAR) | 59 | 948 | 0 | **0** | 0 | - |
| Flux 10 Annexe 7 (fixtures) | 3 | 146 | 0 | **0** | 12 | see below |

Rules the whitespace rewrite already fixed, by mutant count (SaxonC raised them, fontoxpath's
own reading did not): the BR-FR-DEC decimal rules (BR-FR-DEC-02_BT-129 20, -03_BT-146 20,
-04_BT-119 12, -04_BT-152 12, and 11 more), BR-CL-14 8, BR-FR-02_EXT-FR-FE-136 8,
BR-FR-01_EXT-FR-FE-136-2 8, BR-FR-32-LEGALID 4, BR-FR-10_BT-30 4, BR-FXEXT-S-08rev 4. As in
the other sets: number formats, code lists and the rules keyed on them.

## What the cross-check found

**Flux 10: 12 copies where SaxonC stops and the report did not say why.** A no-break space
after a Flux 10 amount (`TaxableAmount`, `TaxTotal`) makes the Annexe 7 stylesheet's
`xs:double` cast fail (FORG0001) and SaxonC abandons the file. The plain route did raise G1.14
on those copies ("doit comporter au maximum 2 décimales avec un séparateur point"), so the file
was not passed, but nothing named the field or the space. The Flux 10 and CDAR readers had
no INV-065, unlike the UBL, CII, FatturaPA, FA(3), Facturae, NAV and ISDOC readers.

Fixed: `readFlux10` and `readCdar` now keep INV-065 findings (`frenchXmlValueFindings` in
`xmlvalues.mjs`), and `flux10Findings` / `cdarFindings` report them, so the page, the server
and the CLI say e.g. `TaxableAmount "85.50[U+00A0]" holds a no-break space ...
(/Report[1]/TransactionsReport[1]/Transactions[3]/TaxSubtotal[2]/TaxableAmount[1])`.

| INV-065 on the Flux 10 and CDAR copies (`eval/french-inv065.mjs`, `eval/french-inv065-saxonc.py`) | Flux 10 | CDAR |
|---|---|---|
| unmutated files with INV-065 | 0 of 3 | 0 of 59 |
| copies SaxonC stops on, INV-065 names the mutated element | **12 of 12** | (none stop) |
| copies SaxonC runs, INV-065 raised | 76 of 134 | 204 of 948 |
| ... and SaxonC raises a new rule on the same copy | 68 | 160 |
| ... and SaxonC raises nothing new | 8 (`TransactionsCount`) | 44 (`Indicator` 32, `ValuePercent` 12) |

The first pass, with every castable leaf counted, raised INV-065 on 288 CDAR copies SaxonC
passed quietly: 120 `GlobalID` (SIRENs), 108 `DateTimeString` (format 204), 16 `URIID`. Those
are string types in the schemas, and no French rule reads them as numbers, so a "not a valid
number" finding there would be wrong. These two readers now leave out leaves whose name ends
in `ID`/`Id`, and CDAR's `DateTimeString`. The 52 left (a boolean, a percent, a count) are
`xs:boolean`/`xs:decimal`/`xs:integer`-like values a no-break space does make unreadable;
the message for these two formats says the official rules "may stop on the whole file or
reject the value", not that Saxon always stops, because on those 52 it did neither.

**A blind spot in the eval, not the product.** `xml-whitespace-saxonc.py` read SaxonC's rule
ids only from an `id` attribute on `svrl:failed-assert`. FNFE's Flux 10 stylesheet writes
none (the id is the `[G1.24]` that opens the message; the CDAR stylesheet does write one), so
on the first pass SaxonC "raised nothing" on every Flux 10 copy and the comparison was empty. It now takes the
attribute, else the bracketed id at the head of the text, as `parseSvrl` in
`schematron-core.mjs` does. With that, Flux 10 went from 108 apparent differences to 0, and
the table above is the corrected run.

## Method

```
git clone --filter=blob:none https://github.com/fnfempe/France_RFE fr && git -C fr checkout 97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d
F=fr/FNFE_RFE_INVOICE
R=$F/UBL/EN16931/2xslt,$F/CII/EN16931/2xslt,$F/UBL/EXTENDED-CTC-FR/2xslt,$F/CII/EXTENDED-CTC-FR/2xslt,$F/Factur-X/EXTENDED/2xslt,$F/CDAR/2xslt,$F/Flux10
node eval/profile-whitespace-crosscheck.mjs --fr --out W/fr  --xsl-roots $R 4 7 $F/Z.example/TEST
node eval/profile-whitespace-crosscheck.mjs --fr --out W/f10 --xsl-roots $F/Flux10 12 7 fixtures/flux10
python3 -I eval/xml-whitespace-saxonc.py --plain-scope W/fr W/fr              # pip install saxonche
python3 -I eval/xml-whitespace-saxonc.py --plain-scope W/f10 W/f10
node eval/french-inv065.mjs W/f10 W/fr > rows.jsonl && python3 -I eval/french-inv065-saxonc.py rows.jsonl
```

New in the scripts: `profile-whitespace-crosscheck.mjs --fr` gives every file the sets
`plainOnlySets(xml, syntax, { profile: "france" })` names, as the page does with France picked,
and takes a set's `.xslt` beside its `.sch` from a root. The commit is the one
`plain/manifest.json` records for every French set (1.4.0.04; Factur-X 1.09.2). Mutants as
before: up to 4 text fields a file (12 for the three Flux 10 fixtures), seed 7, five variants
(trailing U+00A0, trailing `&#160;`, leading `&#xA0;`, an inner space made U+00A0, trailing
U+2003), each compared on the change from its unmutated file. SaxonC-HE 13.1 from PyPI.

## Integrity notes

- Rules: FNFE-MPE's compiled XSLT at the recorded commit, unchanged. Test files: FNFE's own
  examples (`Z.example/TEST`, 100 files) read in place; FNFE publishes no Flux 10 example, so
  the Flux 10 rows are this repository's three made-up fixtures.
- Mutants are synthetic: no real French invoice, status message or e-reporting file with a stray
  no-break space was available. No PPF or platform rejection was observed.
- `--plain-scope` drops ids a stylesheet raises that the row's plain set does not carry; the
  aborts are always kept.

## Not done

- A real Flux 10 file (the three fixtures are ours) and a real PA's CDAR stream.
- `xs:dateTime` leaves in FA(3) and NAV (in `CASTABLE` since the FA(3)/NAV run): not yet
  measured as `nbsp-other-formats-2026-11-17.md` measured the other leaves.
