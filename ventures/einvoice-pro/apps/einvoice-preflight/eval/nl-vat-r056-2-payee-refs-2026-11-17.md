# R056-2's full reach, character references and the no-break space (2026-11-17)

Follow-up to [`nl-vat-r056-2-differential-2026-11-17.md`](nl-vat-r056-2-differential-2026-11-17.md),
whose "Not done" list named a trailing no-break space and the payee's and deliver-to party's
`PartyTaxScheme`. No network for the measurement; Saxon-HE 12.5 was fetched from Maven
Central only to check the oracle.

## What was wrong

1. **Character references were never decoded.** `parseXmlTree` (ubl.mjs, shared by the UBL and
   CII readers) keeps text as written, so `NL123456782&#66;01`, a valid number with its `B`
   written as a reference, reached `normalizeVat` as `NL123456782&#66;01`, compacted to
   `NL1234567826601`, and drew **INV-022, a blocking error**, where Peppol (and any XML
   processor) reads `NL123456782B01` and passes it.
2. **A trailing no-break space was trimmed.** `String.trim()` strips U+00A0; XPath's
   `normalize-space` strips only #x20, #x9, #xD and #xA, so Saxon reads `NL123456782B01` +
   U+00A0 as not matching `^NL[0-9]{9}B[0-9]{2}$` and R056-2 warns. We said nothing.
3. **R056-2 reaches every VAT `PartyTaxScheme`**, not only BT-31/48/63: the payee's, the
   deliver-to party's (header or line), and a second VAT scheme on the seller. The readers
   kept none of them.
4. **The earlier differential's oracle had the same blind spot as 2.** fontoxpath implements
   `normalize-space` with JavaScript's `\s`, which includes U+00A0. Saxon does not:

   ```
   <a>NL123456782B01&#160;</a>  Saxon: starts-with NL true, matches false (warns)
                                fontoxpath: normalize-space gives 14 characters (passes)
   ```

## The changes

- `ubl.mjs` `xmlValue(node)`: decodes character references and the five predefined entities,
  then trims XML whitespace only. BT-31/BT-48/BT-63 (`partyVatId`, `cii.mjs` `ciiVatId`) are
  read with it. Other fields still read raw text (several modules decode after
  `parseXmlTree`, so the parser itself was left alone; see Next).
- Both readers keep `vat_registrations`: every value in R056-2's context (UBL
  `PartyTaxScheme[normalize-space(TaxScheme/ID) = 'VAT']/CompanyID`, CII
  `SpecifiedTaxRegistration[ID/@schemeID = 'VA']`) that is not already a party's `vat_id`,
  with the party (`payee_party`, `delivery_party`, `supplier`, ...) and a label ("Payee",
  "Line 1 deliver-to party").
- `checks.mjs`: INV-064 (a warning) on each registration, at `/vat_registrations/N/value`.
  INV-022/023 stay off them: EN 16931 gives these parties no VAT number.
- `eval/nl-vat-r056-2-differential.mjs`: seven more places (UBL payee, deliver-to, line
  deliver-to, seller's second scheme; CII payee, ship-to, seller's second registration),
  eight more mutants (trailing U+00A0 literal, `&#160;`, `&#xA0;`, a leading U+00A0,
  `&#66;`/`&#x42;` for B, `&#78;` for N, `&#x20;` inside), the assertion evaluated with a
  spec copy of `normalize-space`, and `--saxon-dir` to write every file for
  `eval/r056-2-saxon.xq.txt`.

## Results

`node eval/nl-vat-r056-2-differential.mjs 300 <seed>`

| run | files | Peppol warns | we miss one | we flag a passing one | disagreements |
|---|---|---|---|---|---|
| main (95b9a95 readers), seed 7 | 7,423 | 4,848 | 2,707 | 442 | 3,149 |
| this PR, seed 7 | 7,423 | 4,848 | 0 | 0 | **0** |
| this PR, seed 11 | 7,438 | 4,858 | 0 | 0 | **0** |

On main, the 2,569 misses in the seven new places are every warning there; the 138 on the six
old places are the trailing no-break spaces; the 442 false flags are blocking INV-022 on valid
numbers written with a reference (and the reference `&#x20;` space, which Peppol warns on and
main called INV-022 rather than INV-064, is counted under the warning rows' rules).
Stricter on purpose, not counted (as before): R056-2's shape with a failing checksum or a
`B00` suffix, INV-023: 344 (seed 7), 334 (seed 11).

**The oracle against Saxon.** Every file of both runs (including the ones counted apart) was
written with `--saxon-dir` and re-checked with Saxon-HE 12.5 running R056-2's context and test
as an XQuery (`eval/r056-2-saxon.xq.txt`): **0 of 7,767 (seed 7) and 0 of 7,772 (seed 11) differ**
from the JavaScript oracle. With fontoxpath's own `normalize-space` the oracle differed on the
trailing no-break-space files (900 disagreements with this PR's readers before the oracle was
fixed, all of them that case).

```
java -cp Saxon-HE-12.5.jar:xmlresolver-5.2.2.jar net.sf.saxon.Query -q:eval/r056-2-saxon.xq.txt dir=DIR '!method=text'
```

## Integrity notes

- The generator, the mutants and the oracle are this script's; Peppol's assertion text comes
  from `plain/peppol-*.json` (BIS 3.0.22) unchanged. Saxon is the independent check.
- Seed 11 was run once with the final code; nothing changed after it.
- Tests: `r056-2-reach.test.mjs` (6).

## Not done / next

- **The plain-Schematron route has the same fontoxpath deviation.** `plain-schematron.mjs`
  runs every rule set with fontoxpath's `normalize-space`, so any rule that uses it (R056-2
  among them, and the `normalize-space(...) != ''` presence tests) can differ from Saxon on a
  no-break space. A rewrite like `rewriteLongRepeat`, to a registered spec `normalize-space`,
  plus a Saxon cross-check on files with U+00A0 in tested fields, is the next step.
- `parseXmlTree` keeps references raw for every other field (names, ids, amounts written as
  `&#49;00.00`); only VAT numbers decode them. Decoding in the parser needs every module that
  decodes afterwards (`sdi-receipt`, `verifactu`, `verifactu-response` and others) checked for
  double decoding.
- An unlabelled UBL `PartyTaxScheme` with an NL number: our reader takes it as BT-31, INV-064
  runs on it, R056-2 does not read it.
- The Python CLI: references are decoded by its XML parser already; it keeps no
  `vat_registrations` and has no warning severity for INV-064.
