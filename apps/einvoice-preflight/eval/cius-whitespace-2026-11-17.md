# CIUS-RO, CIUS-PT, CIUS-HR and NLCIUS on the plain route, checked against SaxonC-HE (2026-11-17)

Follow-up to [`pint-zatca-whitespace-2026-11-17.md`](pint-zatca-whitespace-2026-11-17.md),
whose "Not done" listed the national add-on sets as not yet cross-checked against Saxon.
These four are plain-only (`plainOnlySets` in `schematron-core.mjs`): no other route runs
them, so what the plain route reports is what the page, the server and the CLI report.
They need no SchXslt step: each `build-*-rules.mjs` reads the national rules from XSLT
already compiled inside a phive jar on Maven Central, so SaxonC runs the same stylesheet.
(The French sets are the ones built from `.sch`; they stay in "Not done".)

## Result

**No rule-id difference left on any mutant SaxonC ran to the end, in any of the four
sets.** On CIUS-RO, -PT and -HR every value that stops SaxonC is named by XML-VALUE-01.

| set (stylesheet) | files | mutants | ids differ from SaxonC, fontoxpath's own whitespace | ids differ, with the rewrite (what the page runs) | SaxonC aborts | of those, XML-VALUE-01 names the field |
|---|---|---|---|---|---|---|
| CIUS-RO 1.0.9 (`ROeFactura-UBL-validation-Invoice_v1.0.9.xslt`) | 44 | 551 | 20 | **0** | 8 | 8 |
| CIUS-PT 2.1.1 (`urn_feap.gov.pt_CIUS-PT_2.1.1.xslt`) | 20 | 247 | 27 | **0** | 60 | 60 |
| CIUS-HR 2025 (`1.0.4/HR-CIUS-EXT-EN16931-UBL.xslt`) | 21 | 258 | 32 | **0** | 28 | 28 |
| NLCIUS 2.0.3.13 (`si-ubl-2.0.3.13.xslt`, `nlcius-cii-1.0.3.13.xslt`) | 360 | 4,500 | 124 | **0** | 1,064 | see below |

On the 445 unmutated files, the plain route raises the same national rule ids as SaxonC on
437; the other 8 are NLCIUS files where SaxonC's bundled base rule BR-06 throws (below).

Rules the whitespace rewrite fixed, by mutant count (SaxonC raised them, fontoxpath's own
reading did not): BR-NL-12 76 (payment means code), HR-BR-34 12, HR-BR-5 8, HR-BR-CL-1 8,
BR-RO-020_1 8 (invoice type code), DT-CIUS-PT-155 8, HR-BR-CL-2 4, BR-RO-030 4,
DT-CIUS-PT-142/144/146/153 4 each, DT-CIUS-PT-046.1 1. As in the EU and PINT sets: code
lists and the rules keyed on them.

**NLCIUS's aborts are the EU base, not the national rules.** SI-UBL's stylesheet bundles
the whole EN 16931 base around the BR-NL/SI-UBL pattern; `build-nl-rules.mjs` keeps only
the national pattern and the product runs the base on its base route. All 1,064 SaxonC
aborts come from base asserts in that bundle (mode M12: BR-S-08, BR-CO-15, BR-CO-17,
BR-CO-14, BR-27, BR-CO-10, BR-06, BR-CO-16, BR-AE-03 by line), on `Percent`, `TaxAmount`
and `LineExtensionAmount` copies with a no-break space. The earlier report
([`xml-whitespace-crosscheck-2026-11-17.md`](xml-whitespace-crosscheck-2026-11-17.md))
covered those base rules on the base route. The 8 unmutated differences are SaxonC's
BR-06 raising a type error (`normalize-space` on two `RegistrationName`s) on phive's
"multiple legal entity registration name" test files; on one of them
`node schematron-cli.mjs` reports UBL-SR-09 and UBL-SR-57, the real fault.

## A labelling bug in the eval, not the product

The first pass showed 46 CIUS-RO "differences": SaxonC said BR-DEC-RO-14 where the plain
route said BR-RO-Z2. CIUS-RO gives its 22 decimal-places asserts their own `id`s but writes
`[BR-RO-Z2]` at the head of every message, and BR-RO-020_1's message says `[BR-RO-020]`.
`eval/profile-whitespace-crosscheck.mjs` read the bracketed text before the `id`. The
product does the opposite (`report()` in `plain-schematron.mjs` takes `f.rule`, the
assert's `id`, first), so it was always reporting what SaxonC's SVRL carries. The script
now reads the `id` first. The same quirk was behind the "4 left are one rule's label" in
the PINT report (BR-NG-08-GST-SG): the product already reported that id as Saxon does.

## Method

```
# rule stylesheets, as the build scripts fetch them (Maven Central)
for a in cius-ro:4.6.3 cius-pt:4.6.3 eracun:4.6.4 simplerinvoicing:4.6.3; do
  curl -sSfL -o ${a%:*}.jar https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-${a%:*}/${a#*:}/phive-rules-${a%:*}-${a#*:}.jar
  unzip -oq ${a%:*}.jar 'external/schematron/*' -d J/${a%:*}
done
# test files: phax/phive-rules at 80cf1e5, sparse checkout of phive-rules-{cius-ro,cius-pt,
#   simplerinvoicing}/src/test (phive ships no Croatian invoice), and for HR the 20 example
#   e-invoices in shunkica/fiskalizacija2 at 9119d47, docs/Primjeri_eRacuna, plus
#   examples/hr-invoice.xml
R=J/cius-ro/external/schematron/1.0.9,J/cius-pt/external/schematron/2.1.1,J/eracun/external/schematron/1.0.4,J/simplerinvoicing/external/schematron/simplerinvoicing,J/simplerinvoicing/external/schematron/nlcius
node eval/profile-whitespace-crosscheck.mjs --addons --out W/ro --xsl-roots $R 3 7 <phive>/phive-rules-cius-ro/src/test   # pt, hr, nl likewise
python3 -I eval/xml-whitespace-saxonc.py --plain-scope W/ro W/ro W/pt W/hr
python3 -I eval/xml-whitespace-saxonc.py --plain-scope W/nl W/nl                        # pip install saxonche
```

New in the scripts:

- `profile-whitespace-crosscheck.mjs --addons` also takes files no PINT/ZATCA profile
  matches but a plain-only national add-on does (`matchingAddons`), and runs only that
  add-on's set; an `--xsl-roots` entry may be the stylesheet's own folder, and a file may
  be passed in place of a folder.
- `xml-whitespace-saxonc.py --plain-scope` compares only rule ids the row's
  `plain/<set>.json` carries (by `id` or `[ID]` text), so a stylesheet that bundles rules
  the plain set leaves to another route (NLCIUS's EU base, CIUS-PT's BR-29) does not count
  them as misses. SaxonC aborts are always kept. It also tallies the unmutated files.

Mutants as before: 3 text fields a file, seed 7, five variants each (trailing U+00A0
literal, trailing `&#160;`, leading `&#xA0;`, an inner space made U+00A0, trailing U+2003),
each compared on the change from its unmutated file. SaxonC-HE 13.1 from PyPI.

## Integrity notes

- Rules: the official XSLT from the phive jars, unchanged. Test files: the publishers'
  examples as phive ships them, and Croatia's example e-invoices as a public GitHub
  repository carries them; all read in place, none copied here.
- Mutants are synthetic: no real invoice with a stray no-break space was available.
- The four sets were already clean after the morning's rewrite; this run changed no rule
  and no product code, only the two eval scripts. The finding is the measurement.

## Not done

- The French plain-only sets (CIUS-FR UBL/CII, EXTENDED-CTC-FR, CDAR, Flux 10) against
  SaxonC: they come from `.sch`, so SchXslt has to compile them first.
- CIUS-HR has 21 base files (Croatia's 20 published examples and ours); a larger HR corpus
  would tighten that row.
