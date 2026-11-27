# PEPPOL-COMMON-R056-2 (Dutch VAT shape) against the preflight (2026-11-17)

`node eval/nl-vat-r056-2-differential.mjs 300 7` (and seed 11). No network, no
outside data. The oracle is OpenPeppol's own assertion as shipped in
`plain/peppol-ubl.json` and `plain/peppol-cii.json` (Peppol BIS 3.0.22,
`flag="warning"`): every `cac:PartyTaxScheme[TaxScheme/ID = 'VAT']/cbc:CompanyID`
(UBL) or `ram:SpecifiedTaxRegistration[ID/@schemeID = 'VA']` (CII) that starts
with `NL` after `normalize-space` must match `^NL[0-9]{9}B[0-9]{2}$`, evaluated
with fontoxpath on a slimdom DOM.

The script draws Dutch VAT numbers that pass the elfproef (70%) or, for sole
traders since 2020, ISO 7064 mod 97-10, with check digits found by brute force
against its own arithmetic (no code shared with `vat.mjs`), and up to eighteen
mutants of each: a digit changed, a digit typed as a letter, two characters
swapped, one dropped or added, a space, dot, hyphen, no-break space or double
space inside, `NL 123...`, a space before the suffix, padding outside, a
lowercase `b`, all lowercase, the `B` dropped, and a `B00` suffix. Each value
goes into one of six places: the seller's, buyer's or tax representative's
(BT-63) VAT number, in UBL or CII. Ours means INV-022, INV-023 or INV-064 at that
party's `vat_id`.

## Before (main at 95b9a9587, seed 7)

```
files: 4864, disagreements: 2823
| place | files | Peppol warns | we miss one | we flag a passing one | ours on Peppol's warnings |
|---|---|---|---|---|---|
| ubl supplier | 793 | 619 | 402 | 0 | INV-022 217 |
| ubl customer | 769 | 617 | 396 | 0 | INV-022 221 |
| ubl tax_representative | 933 | 613 | 613 | 0 | - |
| cii supplier | 725 | 572 | 383 | 0 | INV-022 189 |
| cii customer | 789 | 633 | 429 | 0 | INV-022 204 |
| cii tax_representative | 855 | 600 | 600 | 0 | - |
stricter on purpose, not counted: R056-2's shape with a failing checksum, or a never-issued B00 / nine zeros (INV-023): 517
```

The backlog note ("seller and buyer VAT numbers already fail INV-022/023 on
that shape") was wrong: `normalizeVat` strips spaces, dots and hyphens and
upper-cases before the shape test, so a valid number written `NL 123456782 B01`,
`NL123456782.B01` or `NL123456782b01` passed on every party, and 1,610 of the
2,441 seller and buyer warnings drew nothing. The tax representative's number
was not read at all (the 137 (UBL) and 105 (CII) extra files in its rows compared with after are checksum
failures INV-023 now catches, which the old code could not see).

## After, seed 7

```
files: 4622, disagreements: 0
| place | files | Peppol warns | we miss one | we flag a passing one | ours on Peppol's warnings |
|---|---|---|---|---|---|
| ubl supplier | 793 | 619 | 0 | 0 | INV-022 217, INV-064 402 |
| ubl customer | 769 | 617 | 0 | 0 | INV-022 221, INV-064 396 |
| ubl tax_representative | 796 | 613 | 0 | 0 | INV-022 209, INV-064 404 |
| cii supplier | 725 | 572 | 0 | 0 | INV-022 189, INV-064 383 |
| cii customer | 789 | 633 | 0 | 0 | INV-022 204, INV-064 429 |
| cii tax_representative | 750 | 600 | 0 | 0 | INV-022 214, INV-064 386 |
stricter on purpose, not counted: R056-2's shape with a failing checksum, or a never-issued B00 / nine zeros (INV-023): 759
```

## After, seed 11

```
files: 4627, disagreements: 0
| place | files | Peppol warns | we miss one | we flag a passing one | ours on Peppol's warnings |
|---|---|---|---|---|---|
| ubl supplier | 758 | 589 | 0 | 0 | INV-022 190, INV-064 399 |
| ubl customer | 783 | 633 | 0 | 0 | INV-022 217, INV-064 416 |
| ubl tax_representative | 743 | 573 | 0 | 0 | INV-022 201, INV-064 372 |
| cii supplier | 828 | 653 | 0 | 0 | INV-022 215, INV-064 438 |
| cii customer | 753 | 588 | 0 | 0 | INV-022 216, INV-064 372 |
| cii tax_representative | 762 | 614 | 0 | 0 | INV-022 211, INV-064 403 |
stricter on purpose, not counted: R056-2's shape with a failing checksum, or a never-issued B00 / nine zeros (INV-023): 747
```

## Stricter than R056-2, on purpose

- A number in R056-2's shape whose elfproef and mod 97-10 both fail, or a `B00`
  suffix or nine zeros (never issued; python-stdnum `nl.btw` refuses both), is
  INV-023, a blocking error. R056-2 checks the shape only.
- Where Peppol warns, our finding is INV-022 (blocking) when the compacted
  number has the wrong length or characters, and INV-064 (a warning, like
  Peppol's) when only the writing is off (spaces, dots, hyphens, lowercase `b`).

## Not done

- A trailing no-break space: both readers `trim()` text, which strips U+00A0,
  so `NL123456782B01` followed by one passes here while `normalize-space` keeps
  it and Peppol warns. `inspectNlVatShape` itself flags it (unit test); the
  reader would need to keep raw text. Not drawn by the generator.
- The payee's and deliver-to party's `PartyTaxScheme` (EN 16931 defines no VAT
  number there, but R056-2's context reaches any `PartyTaxScheme`).
- An unlabelled UBL `PartyTaxScheme` (no `TaxScheme/ID`) with an NL number: our
  reader takes it as a VAT number, R056-2 does not read it. Not drawn.
- The Python CLI reads BT-63 and runs INV-022/023 on it; INV-064 stays silent
  there as INV-061 does (no warning severity).
