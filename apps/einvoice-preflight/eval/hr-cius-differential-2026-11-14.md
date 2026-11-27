# HR-CIUS plain route vs the Tax Administration's XSLT (2026-11-14)

**Question.** Does `plain/cius-hr-ubl.json` (the Porezna uprava's HR-BR rules, read from
XSLT into JSON by `build-hr-rules.mjs` and run by fontoxpath) report the same rules as the
original stylesheet run by a real XSLT engine?

**Inputs.**
- Rules: `external/schematron/1.0.4/HR-CIUS-EXT-EN16931-UBL.xslt` from
  `com.helger.phive.rules:phive-rules-eracun:4.6.4` (Maven Central), which is the Porezna
  uprava's HRUBLSchematron of 13.03.2026. 146 `failed-assert`s in the file, 73 distinct
  asserts after the reader (the XSLT repeats each in its `xsl:otherwise` and `svrl` text), 62 ids.
- Engine: Saxon-JS 2 (`xslt3` from npm), the stylesheet exported to SEF with
  `-nogo -relocate:on`.
- Files: `examples/hr-invoice.xml` (made up, standard-rated, valid OIBs), and a copy with
  line 2 turned into an exempt line (`E`, `HR:E`, 0%, a `TaxExemptionReason`, totals
  adjusted), the same edit `cius-hr.test.mjs` makes.
- Edits: `eval/hr-cius-differential.mjs`, 400 copies per base, each with 1 to 3 random leaf
  edits (delete, blank, change one digit, put in a number/date/time, put in a code such as
  `E`, `HR:O`, `P12`, `386`, or set `listID`/`schemeID`/`unitCode` to `ZZ`). Seeds 20261114
  (standard) and 20261115 (exempt).

**Result.**

| base | files | Saxon errors | same HR ids | differ |
|---|---|---|---|---|
| standard-rated | 401 | 29 | 362 | 10 |
| exempt line | 401 | 34 | 360 | 7 |

- **Every difference** is a file whose `cbc:CustomizationID` was deleted, blanked or
  replaced by another value (`HR:E`, `-5.00`, `12:00`, `XX`, `Z`). The plain route picks a
  national add-on from BT-24, so it runs none; the XSLT, which is only ever run on Croatian
  files, reports HR-BR-5 and whatever else fails. Same design as CIUS-RO, CIUS-PT and NLCIUS.
  The matcher is `urn:mfin.gov.hr:` (not the full id), so a mistyped version still selects
  the HR set and gets HR-BR-5.
- **Saxon errors.** On 29 and 34 files Saxon stopped with a dynamic error: an assert casts a
  blanked or garbled value (`xs:date('')`, `xs:decimal('HR:O')`, `xs:double('')`) and the
  ISO-skeleton XSLT has no guard, so a validator built on it returns no report at all. The
  plain route evaluates each assert separately, reports the others, and lists the one it
  could not evaluate under `skipped`.
- **Rules exercised** (fired at least once by Saxon across both runs): HR-BR-2, -4, -5, -7,
  -9, -10, -16, -25, -26, -33, -34, -36, -37, -40, -53, -56, -CL-1, -CL-2, -E-1, -S-1 (20 of
  62). The HR-extension sums (HR-BR-27..32, -54, -55) and the date-range rules for optional
  dates did not fire, because neither base carries `HRFISK20Data` or those dates; they agree
  by not firing, which is weak evidence.

**Not measured.** A real Croatian business's invoice, an access point's verdict, or the
Porezna uprava's own validator; files with the HR extension.

Reproduce: see the header of `eval/hr-cius-differential.mjs`.
