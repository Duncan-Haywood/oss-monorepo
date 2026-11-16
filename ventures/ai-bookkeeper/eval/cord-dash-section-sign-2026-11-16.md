# Two OCR marks on whole-unit slips: a dash and a section sign (2026-11-16, night)

Flagship item (5), receipts OCR. The last run
([`cord-cash-guess-2026-11-16.md`](cord-cash-guess-2026-11-16.md)) left two named misses
on CORD-v2's phone photos (Clova AI, CC BY 4.0, revision `7f0115a4`, not copied here):

- **A dash before an amount** (`AIR MINERAL -7,000`) was read through on the cash and
  change lines only, so the largest-amount fallback dropped it. Validation-66's psm6
  reading took a stray "1088" instead.
- **"§2,000" for 52,000** (validation-84): tesseract reads a leading 5 as a section sign.

CORD's 200 validation and test photos were read again through the CLI's `--four-pass`
(tesseract 5.3.4, `eval/srd-cli.mjs`, 4 shards). Scored with main's `receipts.mjs`
(`55c3fe60c`, #16694) the readings reproduce the last measurement exactly: validation
totals 65 of 98, tax 23 / 3 / 21; test 53 of 95, tax 16 / 2 / 23.

## What changed (`receipts.mjs`), written from validation only

1. **`undashWhole`**: on a whole-unit slip a dash (or `–`, `—`, `~`) before a digit, at
   the start of the line or after a space, is dropped in the largest-amount fallback, in
   the check that says the guess sits on the cash line, and in `printedOffCash`, as it
   already was on the cash and change lines. On a slip with no total line a refund or
   discount is never the largest amount. Decimal slips are untouched.
2. **`§` glued to a grouped whole amount reads as 5** (`§2,000` to `52,000`, `§3,000` to
   `53,000`). Only before `d,ddd` or `dd,ddd` on a whole-unit slip; no receipt prints a
   section sign there. In validation's 400 readings the pattern occurs in 5 readings of 2
   receipts (validation-84 and -42), and both labels start with a 5.

## Results

| `receipts.mjs` | val totals | val tax right / wrong / none | test totals | test tax right / wrong / none |
|---|---|---|---|---|
| main (#16694) | 65 | 23 / 3 / 21 | 53 | 16 / 2 / 23 |
| + dash read through in the fallback | 65 | 23 / 3 / 21 | 53 | 16 / 2 / 23 |
| + `§` before a grouped amount is 5 | **66** | 23 / 3 / 21 | 53 | 16 / 2 / 23 |

- **The dash change moved no validation total.** Validation-66 was already right (the
  exact-cash rule fixed it last run); psm6 now reads 7,000 instead of 1,088, so all three
  readings with an amount agree, but the answer was 7,000 before too.
- **Validation-84 is right**: psm6 and g6 now read 52,000 on their total lines.
  Validation-42 was already right; its g4 reading still guesses 93,000.
- **Test, scored once at the end, nothing chosen from it**: same counts; one receipt's wrong
  answer changed. Test-56 (labelled 8,999, `CASH 10,000`, total line lost in all four
  readings) went from 8,181 to 10,000: its g6 and g4 readings printed a dash before 10,000
  and now read it, so all four guess the cash handed over. Wrong either way, and the note
  on it says the amount is from the cash line.

## Checks that nothing else moved

| set | main | this run |
|---|---|---|
| CORD dataset text, train / validation / test totals | 749 / 96 / 92 | same |
| CORD dataset text, tax | 324 / 46 / 41 | same |
| SRD photos, CLI `--four-pass` (re-read this run) | totals 154 / 196, tax 133 / 12 / 40 | same, same misses |

The SRD re-read differs from the last run's (153 totals, tax 134 / 12 / 39) on main's own
code: tesseract's readings of a few photos vary between runs. Before and after are compared
on one set of readings.

## What is left

- On test-56 every reading lost the total line and the subtotal plus tax (8,181 + 818) is
  printed in none of them as a total; the arithmetic total (`arithmeticTotals`) needs the
  subtotal and tax in one reading. Not tuned: test is held out, so a fix for that shape must be found and chosen on validation.
- Most misses stay OCR-bound (the labelled digits are in none of the four readings).

## Reproduce

As [`cord-photos-four-pass-2026-11-16.md`](cord-photos-four-pass-2026-11-16.md),
"Reproduce". Tests: `receipt-crosscheck.test.mjs` (two new; both fail on main's
`receipts.mjs`).
