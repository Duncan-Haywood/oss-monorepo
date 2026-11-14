# veraPDF on the Factur-X writer and on the repair (2026-11-14)

veraPDF 1.30.4 (built 2026-11-09), from Maven Central: `org.verapdf.apps:cli:1.30.4`
plus its dependencies (`mvn dependency:copy-dependencies`), run as
`java -cp 'lib/*' org.verapdf.apps.GreenfieldCliWrapper --format text -v <pdfs>`.
software.verapdf.org is blocked from cloud sessions; Maven Central is not.
The flavour is taken from each file's XMP (`pdfaid`).

## 1. Before: the repo's own example PDFs were not PDF/A

`examples/factur-x-invoice.pdf` and `examples/factur-x-credit-note.pdf` (made by
`buildPdfWithAttachment`, a reader-test fixture) fail, checked as 3b, on
6.6.2.1-1 (no XMP metadata), 6.1.3-1 (no trailer /ID), 6.2.4.3-4 (device colour,
no output intent) and 6.2.11.4.1-1 (font not embedded). They stay as reader
fixtures; the new writer is `facturx-pdf.mjs`.

## 2. The writer: 8 of 8 PASS as PDF/A-3b

`node eval/facturx-pdf-verapdf.mjs <dir> <verapdf>`:

| case | bytes | pages | embedded XML = creator's CII | own findings | veraPDF |
|---|---|---|---|---|---|
| plain-en16931 | 45,455 | 1 | yes | none | PASS 3b |
| plain-xrechnung | 45,814 | 1 | yes | none | PASS 3b |
| credit-note | 45,528 | 1 | yes | none | PASS 3b |
| eighty-lines | 201,240 | 6 | yes | none | PASS 3b |
| polish-greek-cyrillic | 51,909 | 1 | yes | none | PASS 3b |
| outside-font (CJK note, printed as ?) | 46,157 | 1 | yes | none | PASS 3b |
| exempt-and-reverse | 46,237 | 1 | yes | none | PASS 3b |
| prepaid-long-note | 51,532 | 1 | yes | none | PASS 3b |

Also PASS 3b: the PDF downloaded from `create.html` in headless Chromium
(example data, Factur-X format, EN 16931 profile). `pdftotext` copies the
Polish, Greek and Cyrillic text out intact (ToUnicode). The official EN 16931
CII Schematron (compiled set in `plain/`, run with slimdom + fontoxpath) gives
no finding on the EN 16931 file. On the XRechnung file it gives one
informational note: the sample draft has no delivery date or period.

## 3. The repair keeps PDF/A: 155 of 155 real PDFs

`python3 eval/repair-verapdf-corpus.py <verapdf> <corpus> <mustangproject>`
(ZUGFeRD/corpus at 84f8d8f, 2026-11-10; ZUGFeRD/mustangproject at 42127fa,
2026-11-14):

- 179 PDFs carry a CII invoice that the repair leaves alone (fail/invalid
  folders skipped).
- veraPDF passes 177 of the originals: 75 as 3b, 61 as 3u, 40 as 3a, 1 as 4f.
- 155 of those, with the tax total (BT-110) pushed up 7.00 in place, are
  repaired with "1 fixed". The other 22 are declined with a reason, as in
  `eval/cii-header-allowances-2026-11-14.md`. pikepdf rewrites only the
  attachment stream and preserves object streams.
- veraPDF passes all 155 seeded copies (the control: the seeding does not break
  PDF/A).
- veraPDF passes all 155 repaired copies.

So the repair's incremental update (a newer attachment and an appended xref
table or stream) keeps PDF/A-3a, 3b and 3u, and the one PDF/A-4f file, valid.
One more case: a PDF from this writer with a seeded tax total, fixed by
`repair-cli.mjs`, also passes.

Not checked: Mustang's validator (`org/mustangproject/` on Maven Central came
back empty through the proxy), Acrobat preflight, a real receiver.
