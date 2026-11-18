# The plain route's whitespace, checked against SaxonC-HE (2026-11-17)

Follow-up to [`nl-vat-r056-2-payee-refs-2026-11-17.md`](nl-vat-r056-2-payee-refs-2026-11-17.md),
which found that fontoxpath's `normalize-space` strips U+00A0 and named the plain
Schematron route (`plain-schematron.mjs`, every rule set the page runs in the browser) as
having the same deviation.

## What was wrong

XPath's whitespace is #x20, #x9, #xD and #xA (F&O 3.1 `normalize-space`; XSD regex `\s`).
Probed on fontoxpath 3.34.0, Saxon-JS 2 (npm) and SaxonC-HE 13.1 (PyPI `saxonche`,
Saxonica's engine, the one Java validators such as Peppol's and KoSIT's run):

| expression (U+00A0 written as NBSP) | spec | fontoxpath | Saxon-JS | SaxonC-HE |
|---|---|---|---|---|
| `string-length(normalize-space("a NBSP"))` | 2 | **1** | 2 | 2 |
| `string-length(replace("a NBSP b", "\s", ""))` | 3 | **2** | **2** | 3 |
| `count(tokenize("a NBSP b", "\s+"))` | 1 | **2** | **2** | 1 |
| `matches("NBSP", "\s")` | false | false | **true** | false |

So the plain route read `NL123456782B01` + U+00A0 as passing Peppol's R056-2, an amount's
`string-length(substring-after(., '.'))` as two decimals, and a code such as `S` + U+00A0
as `S`, where every Saxon-based validator rejects them. Saxon-JS, the engine behind this
repository's SEF route and its earlier cross-checks, has its own deviation on regex `\s`,
so it is no oracle for that part.

A second gap: a number or date holding U+00A0 cannot be cast, and Saxon stops on the whole
file (FORG0001) and reports no rule. fontoxpath throws per rule, and the plain route only
listed those rules as "not checked", so the page showed a clean file a receiver rejects.
The built-in checks did not catch it either: `Number(" 238.00")` is 238.

## The changes (`plain-schematron.mjs`)

- `xmlWhitespaceRewrite(expr)`: every rule test, rule context and XQuery prolog is
  rewritten once (cached) before fontoxpath sees it. `normalize-space(x)`,
  `fn:normalize-space(x)` and `normalize-space()` call a spec copy registered with
  `registerCustomXPathFunction` under `urn:einvoice-preflight:xml-whitespace`; `\s` and
  `\S` in the pattern argument of `replace()` and `tokenize()` become `[ \t\n\r]` and
  `[^ \t\n\r]` (inside a class, ` \t\n\r`). String literals elsewhere, comments and names
  that merely contain the word are left alone. `matches()` already reads `\s` per spec.
- `XML-VALUE-01` (fatal): when a rule's cast fails (FORG0001/FOCA0002), `run()` names
  each leaf value that is a number, date or boolean once JavaScript trims it but not once
  XML does, with the space written out (`"[U+00A0]300.00" holds a no-break space ...`).
- `createPlainRunner({ xmlWhitespace: false })` keeps fontoxpath's own reading, for the
  before/after measurement only.
- No measurable cost: the EN 16931 + Peppol UBL sets on `peppol-credit-note.xml` ran in
  260-280 ms with the rewrite and 237-277 ms without (three warm runs each).

## Method

`eval/xml-whitespace-crosscheck.mjs` takes each UBL or CII file whose sets the Saxon route
has (the EN 16931 base, plus XRechnung or Peppol BIS when the file names them; PINT,
ZATCA and national CIUS files are skipped, having no Saxon form here), shuffles its text
fields with a fixed seed, and writes five mutants per field: a trailing U+00A0 literal, a
trailing `&#160;`, a leading `&#xA0;`, an inner space made U+00A0 (fields with a space
only) and a trailing U+2003. It records the rule ids the plain route raises before and
after the change. `eval/xml-whitespace-saxonc.py` runs every file through SaxonC-HE 13.1
with the official XSLT (eInvoicing-EN16931 `ubl/xslt`, `cii/xslt` at b17b269; XRechnung
7e3ddbe and Peppol BIS 38d693d through SchXslt, as `build-schematron.mjs` builds them) and
compares the change each mutant makes from its unmutated file, so the plain set's older
EN 16931 commit (6e35e0a) cancels out.

```
node build-schematron.mjs        # also leaves the XSLT in its temp folder
node eval/xml-whitespace-crosscheck.mjs --out W/a --no-saxon-js 4 7 examples
node eval/xml-whitespace-crosscheck.mjs --out W/b --no-saxon-js 3 7 <en16931>/ubl/examples
node eval/xml-whitespace-crosscheck.mjs --out W/c --no-saxon-js 3 7 <en16931>/cii/examples
node eval/xml-whitespace-crosscheck.mjs --out W/d --no-saxon-js 3 7 <peppol-bis-invoice-3>/rules/examples
python3 -I eval/xml-whitespace-saxonc.py XSL_DIR W/a W/b W/c W/d
```

## Results

52 files (10 of this repository's examples, 17 EN 16931 UBL, 15 EN 16931 CII, 10 Peppol
BIS), 688 mutants. SaxonC's findings changed on 343 of them.

| | before | after |
|---|---|---|
| mutants Saxon ran to the end (528): rule ids differ from SaxonC | **161** | **0** |
| mutants Saxon stopped on (FORG0001, 160): plain route raised no rule at all | 100 | 0 |
| ... XML-VALUE-01 names the mutated field | 0 | **160** |
| plain route raised a rule SaxonC did not | 0 | 0 |

Rules SaxonC raised that the plain route missed before (mutant counts): BR-CL-18 28,
BR-CO-04 16, BR-CL-14 16, BR-CL-17 12, BR-S-08 12, BR-S-01 8, PEPPOL-EN16931-R007 8,
BR-CL-16 8, BR-TMP-7 8, BR-CL-01 8, BR-CL-04 8, BR-CO-17 8, BR-37 8, PEPPOL-COMMON-R054 4,
BR-S-02 4, PEPPOL-COMMON-R040 4, BR-CL-06 4, BR-CL-08 4, BR-CL-19 4, PEPPOL-EN16931-CL003 4,
BR-CL-20 4, BR-32 4, BR-CL-15 4, PEPPOL-EN16931-P0100 4, PEPPOL-EN16931-R004 1. These are
code lists (a VAT category `S` + U+00A0 is not `S`), the VAT-category rules keyed on it,
Peppol's id and profile rules, and BR-TMP-7 (a date).

**Saxon-JS beside SaxonC** (an earlier pass with Saxon-JS on, before XML-VALUE-01; same
seed, 42 files and 552 mutants when stopped): the plain route after the change matched
SaxonC on all of them; Saxon-JS differed from SaxonC on 16, every one CII-DT-097, a regex
`\s` rule, as the probe table predicts.

## Integrity notes

- The mutants, the comparison and the field picker are this repository's scripts; the
  rules are the official XSLT and the committed plain JSON, unchanged. SaxonC-HE is the
  independent engine. Saxon-HE 12.5 from Maven Central was the plan (as in the R056-2
  report); fetching and running the jar was refused in this session, so SaxonC-HE from
  PyPI took its place.
- Mutants are synthetic: no real invoice with a stray U+00A0 was available. The variants
  are the ones copied text leaves (French-locale number formatting uses U+00A0 or
  U+202F as the thousands separator).
- The run was sized to finish in a session: 3 or 4 fields a file, not every field.

## Not done

- The built-in checks (`ubl.mjs`, `cii.mjs`, `Number()`) still accept a literal U+00A0
  around an amount; only the official-rules route says so. An INV rule on the readers
  would catch it with the official rules off.
- PINT, ZATCA, CIUS-RO/PT/HR, NLCIUS and the French sets get the same rewrite but were
  not cross-checked here (no Saxon form built for them in this run).
