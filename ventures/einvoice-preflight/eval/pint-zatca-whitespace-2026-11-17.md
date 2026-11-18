# PINT and ZATCA on the plain route, checked against SaxonC-HE (2026-11-17)

Follow-up to [`xml-whitespace-crosscheck-2026-11-17.md`](xml-whitespace-crosscheck-2026-11-17.md),
which checked the plain route's whitespace rewrite against SaxonC-HE on the EN 16931,
XRechnung and Peppol BIS sets and left PINT and ZATCA out ("no Saxon form built for them").
Those sets come from XSLT in the first place (`build-pint-rules.mjs` and `build-zatca-rules.mjs`
read the phive jars' stylesheets back into `./plain/`), so SaxonC can run the same
stylesheets directly. They are also plain-only: no other route in this product checks a
PINT or ZATCA file (`plainOnlySets` in `schematron-core.mjs`), so what the plain route
does is what the page, the server and the CLI report.

## What the cross-check found

**Oman's PINT rules: 18 of them never ran, on any file.** `plain-compile.mjs` pastes
global variables into `xsl:function` bodies. Oman's jurisdiction set (PINT OM 1.0.1,
billing and self-billing) has a global `$lines` and a function `u:vatBase($cat, $lines,
$allow, $charge)`; the global was pasted over the function's own parameter, so the
prolog was not valid XQuery. Every rule whose test needs the prolog threw, and the plain
route listed it as "not checked": IBR-033-OM, -039, -054, -065, -071, -077, -082, -157,
-158, -168 (and its warning), -171, ALIGNED-IBRP-E-08-OM, -O-08, -Z-08, -S-08, -S-09
(and its warning). These are the line net amount (quantity x price), the allowance
percentage, the VAT breakdown sums by category and the tax-currency total. A real Oman
invoice with a wrong line total got no finding for it.

Fixed: a function's own parameters and variables now shadow globals of the same name
(`plain-compile.mjs`, `compileSchematron`). The other 31 rule sets with a prolog were
unaffected; all 33 now parse (`plain-prolog.test.mjs` checks every one).

**Two engine gaps behind two Oman rules.** With the prolog fixed, two rules still threw:

- IBR-171-OM (issue date not in the future, by Oman time) calls `adjust-date-to-timezone`
  and `adjust-dateTime-to-timezone`, which fontoxpath 3.34 does not have. The compiler now
  renames them to XQuery copies of F&O 3.1 sections 10.7.1-2 in the prolog (`TZ` in
  `plain-compile.mjs`); they give the spec's own examples (test). fontoxpath's
  `format-integer($n, '00')` does not pad, so the helper pads by hand.
- ALIGNED-IBRP-S-08-OM uses XSLT's `current()` inside a predicate. In a Schematron assert
  that is the rule's context node, so the test is now bound with
  `let $schematron-current := . return (...)`.

After the rebuild, a made-up Oman invoice runs all 154 jurisdiction checks with nothing
skipped; only `plain/pint1-om-jur-ubl.json` and `pint1-om-sb-jur-ubl.json` changed.

**A time with a no-break space.** ZATCA's rules cast `cbc:IssueTime` as `xs:time`; with a
no-break space Saxon stops on the file. The plain route saw the cast fail but
`unreadableValues` did not know times, so XML-VALUE-01 named no field (4 copies).
`CASTABLE` in `xmlvalues.mjs` (and the CLI's `xmlvalues.py`) now includes `hh:mm:ss`
with optional fraction and zone, so XML-VALUE-01 and the built-in INV-065 name it; on
the 12 IssueTime copies all 12 are named now.

## Method

```
# rule stylesheets, as the build scripts fetch them
curl -sSfL -o pint.jar   https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-peppol-pint/4.6.4/phive-rules-peppol-pint-4.6.4.jar
curl -sSfL -o peppol.jar https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-peppol/4.6.3/phive-rules-peppol-4.6.3.jar
curl -sSfL -o zatca.jar  https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-zatca/4.6.3/phive-rules-zatca-4.6.3.jar
unzip -oq pint.jar 'external/schematron/*' -d J/pint   # and the same for peppol, zatca
# test files: phax/phive-rules at 80cf1e5, sparse checkout of
#   phive-rules-peppol-pint/src/test/** and phive-rules-zatca/src/test/**
node eval/profile-whitespace-crosscheck.mjs --out W/p1 --xsl-roots J/pint,J/peppol,J/zatca 3 7 \
  <pint>/pint-sg/1.4.1 <pint>/pint-jp/1.1.3 <pint>/pint-jp-ntr/1.1.3      # p2..p4 likewise
python3 -I eval/xml-whitespace-saxonc.py W/p1 W/p1 W/p2 W/p3 W/p4a W/p4b   # pip install saxonche
```

`profile-whitespace-crosscheck.mjs` writes the same mutants as the earlier script (3
text fields a file, seed 7; trailing U+00A0 literal, trailing `&#160;`, leading `&#xA0;`,
an inner space made U+00A0, trailing U+2003) and a `map.json` from set name to the
stylesheet named by its `from` in `plain/manifest.json`; `xml-whitespace-saxonc.py` now
reads that map and tallies per profile. Each mutant is compared on the change from its
unmutated file. The releases match the shipped sets: PINT SG 1.4.1, A-NZ 1.1.3 (billing,
self-billing), JP 1.1.3, JP non-tax-registered 1.1.3, MY 1.3.1 (billing, self-billing),
AE 2026.5, OM 1.0.1, ZATCA 3.4.6.

## Results

182 files (OpenPeppol's and ZATCA's own examples, as phive ships them), 2,268 mutants;
SaxonC-HE 13.1 ran the official XSLT.

| mutants Saxon ran to the end and the plain route did too (1,692 shipped, 1,716 after): rule ids differ from SaxonC | rules as shipped this morning | after the fixes |
|---|---|---|
| without the whitespace rewrite (fontoxpath's own reading) | 394 | 377 |
| with it (what the page runs) | **80** (76 Oman) | **4** |

The 4 left are one rule's label, not a disagreement: PINT SG's BR-NG-08-GST-SG has
`id="BR-NG-08-GST-SG"` and text `[BR-NG-08]-...`; this script read the id from the
text, Saxon from the attribute. Both fire on the same 4 copies. (Correction, later on
2026-11-17: the product itself reports the attribute, as Saxon does; only the script read
the text. The script now reads the `id` first: [`cius-whitespace-2026-11-17.md`](cius-whitespace-2026-11-17.md).)

| mutants Saxon stops on (FORG0001) | shipped | after |
|---|---|---|
| plain route raised no rule at all without the rewrite | 295 of 536 | 274 of 512 |
| XML-VALUE-01 names the field | 520 | 508 + 4 IssueTime now named |
| plain route did not see the abort (Oman rules that never ran) | 12 | 0 |

(The two runs' abort counts differ because the Oman files were re-mutated after the fix:
a fresh run of the same seed over the same 49 files.)

Rules SaxonC raised that fontoxpath's own whitespace missed (mutant counts, top): ibr-cl-14
52 (the shared PINT country-code list), aligned-ibrp-cl-01-aunz 20, aligned-ibrp-047 and
-048 20 each, CL-04-OM 20, ibr-cl-01 20, ibr-cl-04 16, BR-CL-18 16, BR-CL-17-GST-SG 12,
BR-109-GST-SG 12, ibr-120 12: code lists and the VAT-category rules keyed on them, as
with the EU sets.

**40 copies where only the plain route stopped.** A no-break space in a boolean
(`cbc:ChargeIndicator` 24, `cbc:TaxIncludedIndicator` 16): Saxon's rules compare these as
strings (`= 'true'`), so it ran on and raised nothing; fontoxpath cast one and the plain
route reports XML-VALUE-01. Kept: UBL's schema types both as `xs:boolean`, which a
no-break space makes invalid, so the file is wrong either way; the finding is stricter
than the Schematron, not wrong.

**Unmutated files.** On all 182, the plain route raises the same rule ids as SaxonC except
BTOM-META-001 on the 49 Oman files: an always-true "ruleset version" banner the compiler
leaves out on purpose (`pint-jp-my-ae-om.test.mjs`). So the 18 rules switched on today
raise nothing on any of OpenPeppol's 49 Oman examples that Saxon does not.

## Integrity notes

- Rules: the official XSLT from the phive jars on Maven Central, unchanged; test files:
  phive's copies of the publishers' examples, read in place and not copied here.
- Mutants are synthetic; no real invoice with a stray no-break space was available.
- SaxonC-HE from PyPI is the independent engine, as in the earlier report.

## Not done

- CIUS-RO, CIUS-PT, CIUS-HR and NLCIUS: done later the same day, 0 rule-id differences
  ([`cius-whitespace-2026-11-17.md`](cius-whitespace-2026-11-17.md)). The French sets
  (plain-only, built from `.sch`) still need SchXslt to compile their `.sch` first.
