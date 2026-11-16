# The cash-guess rule scored on CORD's photos, and exact cash (2026-11-16, late)

Flagship item (5), receipts OCR. The last run
([`receipt-cash-guess-2026-11-16.md`](receipt-cash-guess-2026-11-16.md)) gave a
largest-amount guess printed on the cash line no vote (`CASH_GUESS_VOTE`), written from
the description of CORD validation-30, because huggingface.co refused that session. It
answered this one, so CORD-v2's 200 validation and test photos (Clova AI, CC BY 4.0,
revision `7f0115a4`, not copied here) were read again through the CLI's `--four-pass`
(tesseract 5.3.4, `eval/srd-cli.mjs`, 4 shards, about 25 minutes).

## The readings reproduce the last measurement

Scored with `receipts.mjs` from before the cash rule (`7d80d1b0e`, #16642) the new
readings give validation totals 64 of 98, tax 22 / 4 wrong / 21 none, and test 53 of 95,
tax 16 / 2 / 23: the figures `cord-photos-four-pass-2026-11-16.md` reported.

## The cash rule on the photos: one fixed, one broken

| `receipts.mjs` at | val totals | val tax right / wrong / none | test totals | test tax right / wrong / none |
|---|---|---|---|---|
| before the cash rule (`7d80d1b0e`, #16642) | 64 | 22 / 4 / 21 | 53 | 16 / 2 / 23 |
| cash guess gets no vote (#16655, main) | 64 | 22 / 4 / 21 | 53 | 16 / 2 / 23 |
| + exact cash keeps its vote (this run) | **65** | 22 / 4 / 21 | 53 | 16 / 2 / 23 |
| + tax tie by tax lines printed (this run) | **65** | **23 / 3 / 21** | 53 | 16 / 2 / 23 |

- **Validation-30 is right with the rule**, as intended: readings psm4 and g4 guess
  `CASH 50,000`, now 0 votes, and psm6's 21,000 stands.
- **It broke validation-66**, which the earlier text-only description could not show. The
  slip is one bottle of water: `AIR MINERAL 7,000`, no total line, `CASH 7,000`. Two
  readings guessed 7,000 (one from the item line, one from the cash line); the cash-line one
  now counted 0, and psm6's stray "1088" won the tie. Exact cash, as on SRD 1108, but
  with no subtotal or tax for the arithmetic exception to see. Net: 64 either way.

## What this run changed (`receipts.mjs`), written from validation only

1. **Exact cash keeps its vote** (`printedOffCash`): a cash-line guess counts its half vote
   when any reading prints the same amount on a line that is not the cash line (an item, a
   total). On validation-66 "AIR MINERAL 7000" does; on validation-30 the 50,000 appears on
   `CASH` lines only. A line straight after a bare `CASH` line is treated as the cash line.
   Validation totals 64 to 65.
2. **A tax tie goes to the amount more readings print on a tax line** (`onTaxLines`).
   Validation-65: `TAX 16.00 4 4,264` in one reading, `4,964` in another, 1-1, and the tie
   went to the first. A third reading prints `TAX 10.00 2 4,964` but lost its total, so it
   parsed no tax and had no vote. Counting the readings' tax lines breaks the tie 2-1.
   That third reading does not look like a rupiah slip on its own (too few amounts), so each
   line is also read in the style of the reading the total came from. Only ties change;
   the vote itself is as before. Validation tax 22 to 23, wrong 4 to 3.

Test was scored once, after both changes, with nothing chosen from it: no test receipt
moved (`--misses` lists identical, counts identical).

## Checks that nothing else moved

| set | main | this run |
|---|---|---|
SRD_ROWS
| CORD dataset text, train / validation / test totals | 749 / 96 / 92 | same |
| CORD dataset text, tax | 324 / 46 / 41 | same |

Both changes live in the vote across three or more readings, so a single text
(SROIE's dataset text, CORD's dataset text) cannot move; the CORD text row confirms it.

## What is left

- Most misses stay OCR-bound: on 23 of validation's 33 total misses the labelled digits are
  in none of the four readings.
- Dash-prefixed amounts (`AIR MINERAL -7,000`) are dropped by the largest-amount fallback;
  the dash is read through on cash and change lines only. Validation-66's psm6 and g6
  readings lost 7,000 that way.
- "§2,000" for 52,000 (validation-84).

## Reproduce

As [`cord-photos-four-pass-2026-11-16.md`](cord-photos-four-pass-2026-11-16.md), "Reproduce";
for SRD, `eval/srd-fetch.mjs` and the `srd-cli.mjs` lines in
[`receipt-cash-guess-2026-11-16.md`](receipt-cash-guess-2026-11-16.md). Earlier versions:
`git archive <commit> ventures/ai-bookkeeper | tar -x -C old`, copy today's
`eval/cord-receipts.mjs` in, score from there. Compare commits on one set of readings.

Tests: `receipt-crosscheck.test.mjs` (two new; both fail on main's `receipts.mjs`).
