# INV-065: a no-break space around a number or date, in the built-in checks (2026-11-17)

Follow-up to [`xml-whitespace-crosscheck-2026-11-17.md`](xml-whitespace-crosscheck-2026-11-17.md),
whose "Not done" said the built-in readers still accept a literal U+00A0 around an amount.

## What was wrong

XML whitespace is space, tab, CR and LF. The readers (`ubl.mjs`, `cii.mjs`, and the CLI's
`ubl.py`/`formats.py`) trim element text with JavaScript's `String.trim()` or Python's
`str.strip()`, both of which also take U+00A0, U+202F, U+3000, U+FEFF and the other Unicode
spaces. So `<cbc:PayableAmount>238.00` + U+00A0 read as 238 and every built-in check passed,
while a Saxon-based validator cannot cast the value to xs:decimal and stops on the whole file
(FORG0001). With the official rules off (the default on a large file, or the CLI), nothing was
said. The same value written as `238.00&#160;` failed the other way: the UBL reader does not
decode character references in amounts, so it refused the whole file with "UBL amount is not a
number" and no field-level finding.

## The change

- `xmlvalues.mjs` (new): `unreadableLeaves(tree)` lists every leaf element whose decoded text is
  a decimal, ISO date, CII 102 date or boolean once JavaScript trims it but not once XML does,
  with the plain route's path (`/Invoice[1]/LegalMonetaryTotal[1]/PayableAmount[1]`). Both
  readers keep the list as `invoice.xml_values`; `checks.mjs` reports each as **INV-065**
  (blocking), with the space spelled out (`238.00[U+00A0]`). `plain-schematron.mjs` now imports
  its `NON_XML_SPACE`, `CASTABLE`, `spaceName` and `visibleSpaces` from here, so XML-VALUE-01
  and INV-065 judge a value the same way.
- `ubl.mjs` `asNumber` decodes character references before reading: `238.00&#160;` reads as the
  literal does (and draws INV-065), and `&#50;38.00` reads as 238, as XML says it is.
- CLI: `src/einvoice_preflight/xmlvalues.py` mirrors it; `ubl.py` and `formats.py` keep
  `xml_values`, `checks.py` reports INV-065.
- `what-does-this-e-invoice-error-code-mean.html` documents INV-065.

## Method

`eval/nbsp-amounts.mjs` walks each UBL or CII file's leaves, and for every leaf whose text is a
number, date or boolean writes five mutants: a trailing U+00A0, a leading U+202F, a trailing
U+FEFF and a trailing U+3000 (all literal), and a trailing `&#160;`. Each mutant runs through the
reader and `checkInvoice`. "Before" is the rule ids the mutant adds over its unmutated file with
INV-065 left out (for the literal variants that is exactly the old behaviour: the reference
decoding does not touch them; for `&#160;` the old behaviour was measured on a run before the
`asNumber` change). Text leaves (names, ids, codes) get a trailing U+00A0 as a control.
`eval/nbsp-amounts-saxonc.py` then asks SaxonC-HE 13.1 (PyPI `saxonche`) whether each original
and each mutated value is castable as xs:decimal, xs:date or xs:boolean.

```
git clone --depth 1 https://github.com/ConnectingEurope/eInvoicing-EN16931 EN
node eval/nbsp-amounts.mjs --out W examples EN/ubl/examples EN/cii/examples
python3 -I eval/nbsp-amounts-saxonc.py W      # in a venv with saxonche
```

## Results

62 files (28 of this repository's UBL/CII examples, 19 EN 16931 UBL, 15 EN 16931 CII; the
non-UBL/CII examples are skipped), 2,784 number/date/boolean leaves, 13,920 mutants.

| variant | mutants | built-in checks said nothing, before | INV-065 names the field, after |
|---|---|---|---|
| trailing U+00A0 | 2,784 | 2,784 | 2,784 |
| leading U+202F | 2,784 | 2,784 | 2,784 |
| trailing U+FEFF | 2,784 | 2,784 | 2,784 |
| trailing U+3000 | 2,784 | 2,784 | 2,784 |
| trailing `&#160;` | 2,784 | 1,021 silent; 971 refused the whole file (UBL); 792 drew an unrelated amount rule (CII) | 2,784 |

- **Literal spaces: 11,136 of 11,136 mutants passed the built-in checks clean before; INV-065
  names the mutated field on all 11,136 after.**
- SaxonC-HE casts all 13,920 original values and refuses all 13,920 mutated ones: INV-065 and
  Saxon agree on every row.
- Control: 2,701 text leaves with a trailing U+00A0, **0 INV-065**.
- The shipped examples and the EN 16931 examples draw no INV-065 unmutated.

## Integrity notes

- The mutants are synthetic: no real invoice with a stray U+00A0 was available. The characters
  are the ones locale formatting and copied text leave (French formatting uses U+00A0 or U+202F
  as the thousands separator; a byte-order mark lands inside text when files are concatenated).
- The Saxon oracle checks castability of the value, the step a validator stops on, not a full
  run of the official XSLT on each mutant; the earlier report ran the full XSLT on 160 such
  values and Saxon stopped on all 160.
- A thousands separator inside a number (`1` U+00A0 `000.00`) is not castable either way and is
  not INV-065 (JavaScript's trim does not make it a number); the readers already refuse it.

## Not done

- Attributes are not read (no EN 16931 attribute is a number or date).
- Other syntaxes with their own readers (FatturaPA, FA(3), Facturae, NAV, ISDOC) trim the same
  way; not measured here.
- PINT and ZATCA sets: the cross-check the official-rules route still owes (SchXslt compiles their .sch).
