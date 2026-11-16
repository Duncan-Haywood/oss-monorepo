# An unreadable PB1 line, read from the total (2026-11-16, late night)

Flagship item (5), receipts OCR. The last run
([`cord-dash-section-sign-2026-11-16.md`](cord-dash-section-sign-2026-11-16.md)) left 21
validation receipts whose labelled tax the CLI's `--four-pass` reading did not find at all.
This run went through those 21, chose rules from validation only, and scored test once at the end.

CORD-v2's 200 validation and test photos (Clova AI, CC BY 4.0, revision `7f0115a4`, not
copied here) were read again through `eval/srd-cli.mjs` (tesseract 5.3.4, 4 shards). Scored
with main's `receipts.mjs` (`59e5cb70e`) the readings reproduce the last measurement
exactly: validation totals 66 of 98, tax 23 / 3 / 21; test 53 of 95, tax 16 / 2 / 23.

## What the 21 hold

Every reading's tax, subtotal and total lines were printed for each miss
(the script is short and not kept; `parseReceipt` on each reading, then the lines matching
tax, PB1, subtotal or total).

- **11 are lost**: no reading has a tax line with digits, or the total is lost too
  (validation-5, -7, -22, -25, -36, -45, -59, -77, -81, -91, -96), or the photo is the
  same blur twice (-27 and -44 are one receipt photographed twice: "Pajak Resto" with no amount).
- **5 have a wrong total**, and the tax checks lean on it (validation-61, -63, -70, -85, -87).
  Validation-85 prints the tax as `PRi: 1,364` and `PRL: 1,344` ("PB1" misread); see
  "Tried and dropped".
- **2 have the right total and a tax line no reading could read**, with the subtotal printed:
  - validation-20: total 16,500 read twice, `PBI 10% $ 2) NL` in g6, `SUBTOTAL 15, 000` in psm4.
  - validation-93: total 172,000 read twice, `TAX 15.45`, `TAX 15.440`, `TAX 15.435` (the tax is
    15,636), and `SUBTOTAL 56,364` three times: 156,364 with its first digit lost.

## What changed (`receipts.mjs` `voteTax`, `splitAtRate`)

When the readings settle a whole-unit total and find no tax, and no read subtotal closes to
it, the total is split at Indonesia's rates (PB1 is 10% of the subtotal; PPN 10% or 11%):
subtotal = total / (1 + rate), rounded, and tax = total less that. The tax is taken only when

1. some reading prints a tax line (TAX, PB1 and its misreads, Pajak, PPN),
2. the split is consistent (the tax is the subtotal times the rate, rounded),
3. a subtotal line in some reading shows the split's subtotal, whole or its last five digits
   (a subtotal ending in four zeros must show in full), and
4. exactly one rate passes.

The receipt says so: "no reading could read the tax line's amount: took 15636, the total
split at 10% (a subtotal line shows 156364), check the tax".

## Results

| `receipts.mjs` | val totals | val tax right / wrong / none | test totals | test tax right / wrong / none |
|---|---|---|---|---|
| main (`59e5cb70e`) | 66 | 23 / 3 / 21 | 53 | 16 / 2 / 23 |
| + split at the rate (first version) | 66 | 25 / 4 / 18 | | |
| + subtotal of 4 digits or more, tax over 0 | 66 | **25 / 3 / 19** | **53** | **16 / 2 / 23** |

The first version split validation-70's wrongly settled total of 3 (a stray digit) into a tax
of 0; the guard in the third row is why. On test the rule took no tax, right or wrong: no test
receipt has a settled total, a tax line and a subtotal line that agree with the split.

Tax read where none is labelled stays 0 on validation and 1 on test (as on main). Totals do
not move: the rule reads only the tax.

### Tried and dropped, after test was seen

A line opening with `PRI` or `PRL` read as a PB1 tax line took validation-85's tax
(1,364; 26 / 3 / 18 on validation). On test it read test-14's `PRI : 25,080` (the tax is
25,585, read right as `PBI 25,585` in another reading); the two tied in the vote and the
first reading's won, so test went to 15 / 3 / 23. Net zero over 200 photos, so it was
taken out. That choice was made after scoring test, so test is no longer clean for it.
What would have saved test-14 is a vote that counts a service charge in the arithmetic
(238,000 + service 17,850 + 25,585 is the total, 281,435). It was found on test, so it must
be chosen and measured on validation and SRD first.

## Checks that nothing else moved

| set | main | this run |
|---|---|---|
| CORD dataset text, train / validation / test totals | 749 / 96 / 92 | same |
| CORD dataset text, tax | 324 / 46 / 41 | same |
| SRD photos, CLI `--four-pass` (re-read this run) | totals 154 / 196, tax 133 / 12 / 40 | same |

The dataset text goes through `parseReceipt` alone, which the rule does not touch.

## What is left

- The service charge in the tax vote (above), from validation first.
- Validation's 5 wrong totals with a tax line; validation-85 shows a total of 15,000 that
  cash less change (20,000 less 5,000) and the subtotal plus `PRi: 1,364` both make.
- The 11 lost ones are OCR-bound.

## Reproduce

As [`cord-photos-four-pass-2026-11-16.md`](cord-photos-four-pass-2026-11-16.md),
"Reproduce". Test: `receipt-crosscheck.test.mjs` ("a whole-unit slip's unreadable tax is the
total split at 10%"; it fails on main's `receipts.mjs`).
