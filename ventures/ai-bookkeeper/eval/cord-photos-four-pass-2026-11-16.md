# CORD photos through the CLI's four readings (2026-11-16, night)

Flagship item (5), the "BUILDABLE HERE" note in `portfolio/flagships.yaml`: the receipt
vote's rules since 2026-11-15 were written from the 200 SRD photos, and two runs asked for a
held-out set of photos read several times. huggingface.co answered this session, so CORD-v2's
200 validation and test photos (Clova AI, CC BY 4.0, revision `7f0115a4`, not copied here)
went through the CLI's `receipts FILE --four-pass` path: tesseract 5.3.4, `eval/srd-cli.mjs`
in 4 shards, about 25 minutes. This is the first time CORD's photos were read by the CLI;
the 2026-11-12 run read them with the page's engine (tesseract.js, two readings).

## Every version of the reader on the same readings

Readings made once; `receipts.mjs` swapped per commit (`git archive <commit>`), scored with
today's `eval/cord-receipts.mjs`. Validation has 98 labelled totals and 47 labelled taxes,
test 95 and 41.

| `receipts.mjs` at | val totals | val tax right / wrong / none | test totals | test tax right / wrong / none |
|---|---|---|---|---|
| before the tax vote (`ed317ae43~1`) | 63 | 13 / 3 / 31 | 53 | 10 / 2 / 29 |
| four-reading tax vote (`ed317ae43`, #16323) | 63 | 16 / 10 / 21 | 53 | 13 / 5 / 23 |
| misread labels, arithmetic (#16330) to main (#16633) | 63 | 16 / 10 / 21 | 53 | 14 / 4 / 23 |
| **this run** | **64** | **22 / 4 / 21** | **53** | **16 / 2 / 23** |

What the held-out photos say about the SRD-written rules:

- **The four-reading tax vote generalises, with a cost.** It found 3 more taxes on each split,
  and it also tripled the wrong ones on validation (3 to 10): on rupiah slips a stray small
  number read as a tax and the arithmetic repair "fixed" right ones.
- **The rules since then (#16330 to #16633) moved one receipt**, test +1 tax, -1 wrong. On
  US photos they were worth 130 to 133 of 185; on Indonesian photos they mostly do not fire.
- **The total-first rules (#16491, #16633) never fire on CORD.** Totals are 63 / 53 at every
  commit. Rule 1 looks for the subtotal plus the tax printed as "146.57"; a rupiah sum such as
  20,000 is never written that way. A whole-unit form of that search ("20,000", "20.000",
  "20000") was tried this run and changed no validation receipt, so it was not kept.

## What this run changed (`receipts.mjs`), written from validation misses only

1. **A dash before cash and change** ("CASH -50,000", "CHANGE -30,000"): on a whole-unit slip
   with no total line, the cash-less-change fallback now reads through a leading dash.
   Before, neither amount read, and the largest amount on the page won. Validation-73.
2. **PB1 as OCR prints it**: "PBI", "PBl", "PB]", "PB!" and "P Resto" / "P-Resto" (the dot
   lost) are tax lines. Validation-2, -35, -95 and others.
3. **No tax under 1% of a whole-unit total**: "TAX 5.45" on a 172,000 receipt, a stray "3", or
   "10.000%" read as 1.00 are not taxes. A yen receipt's "Tax ¥22" on ¥300 (7%) stays. An
   absolute floor of 100 units was tried first and broke that yen test, so the floor is relative.
4. **Rupiah rounding is not a misread digit**: subtotal 18,181 plus PB1 1,818 prints a total
   of 20,000. The one-digit repair took 1,819 against three readings of 1,818. On a whole-unit
   slip, a tax exactly one unit off the arithmetic now stands.

Measured on validation after each change: change 1 took totals 63 to 64; change 2 took tax 16
to 20 (wrong 10 to 9); changes 3 and 4 took it to 22, wrong 4. Test was scored after each change
as well. No test receipt was read and nothing was chosen or kept because of a test score.
Test moved 14 to 16 right and 4 to 2 wrong, with totals unchanged.

## Checks that nothing else moved

| set | before | after |
|---|---|---|
| SRD photos, CLI `--four-pass` (re-read this run) | totals 154 / tax 133 (12 wrong, 40 none) | same |
| SROIE dataset text (626) | totals 611, merchants 531, dates 601 | same |
| CORD dataset text, train / validation / test tax | 323 / 46 / 41 | **324** / 46 / 41 |
| CORD dataset text totals | 749 / 96 / 92 | same |

Train's +1 is train-203 ("PB 1 10% 10.000%" read as a 1.00 tax, now the subtotal-to-total
difference, right). Train-397, the same line, went from wrong to none. The SRD baseline
reproduced the last run's 154 and 133 exactly.

## What is left

- Most misses are OCR-bound. The labelled total's digits appear in none of the four readings
  on 23 of validation's 34 total misses and 27 of test's 42.
- Validation-30: three readings fall back to the largest amount, the cash 50,000, and two
  guesses (0.5 each) outvote the right total. Validation-65: a 1-1 tie on the tax (4,264 vs 4,964)
  goes to the first reading.
- "§2,000" for 52,000 (validation-84): one receipt, left.
- The page's own readings (tesseract.js) were not rebuilt. The page uses the same vote, so
  changes 1 to 4 reach it, but its figures are not re-measured.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
python3 -m venv v && v/bin/pip install pyarrow
for s in validation-00000-of-00001-cc3c5779fe22e8ca test-00000-of-00001-9c204eb3f4e11791; do
  curl -LO https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data/$s.parquet; done
v/bin/python -I eval/cord_images.py validation-*.parquet validation photos
v/bin/python -I eval/cord_images.py test-*.parquet test photos
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs photos $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/cord/test.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4
```

Earlier versions: `git archive <commit> ventures/ai-bookkeeper | tar -x -C old`, copy today's
`eval/cord-receipts.mjs` in, and score from there.
