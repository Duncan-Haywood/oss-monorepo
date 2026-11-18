# Wrong totals on CORD photos: change lines and sums across readings (2026-11-17)

Flagship item (5), receipts OCR. The note before last
([`cord-tax-split-2026-11-16.md`](cord-tax-split-2026-11-16.md)) left five CORD validation
photos with a tax line and a wrong total (validation-61, -63, -70, -85, -87). The last note
([`service-charge-vote-2026-11-17.md`](service-charge-vote-2026-11-17.md)) could not score its
service-charge vote on CORD photos because huggingface.co refused the download. This session it
answered (HTTP 200), so both were done here. Rules were chosen on validation photos and on CORD
train text; test photos were scored once, at the end.

## Readings

CORD-v2's 100 validation and 100 test photos (Clova AI, CC BY 4.0, revision `7f0115a4`, not
copied here) were written with `eval/cord_images.py` and read through `eval/srd-cli.mjs`
(tesseract 5.3.4, ImageMagick, 4 shards, about 35 minutes for 200). The 200 SRD photos were
fetched with `eval/srd-fetch.mjs` and read the same way as a second check.

Main at `87b62500b` (with the service-charge vote) on these readings: validation totals 66 of
98, tax 25 / 3 / 19 (right / wrong / none), the same as before the service-charge vote. **The
service-charge vote changes nothing on CORD validation photos.** On test it does not rescue
test-14 either (see below).

## The five

| receipt | what the readings show | now |
|---|---|---|
| validation-70 | `TOTAL 121,798` in one reading; the others took "tal item 3 Total aty #3" ("Total Qty") as the total line: 3 | **right**, and the tax (PB1 11,073) with it |
| validation-61 | "Total Kembalian 1,800" (the change) taken as the total; "Total Bayar 8, 260" in two readings, "8, 2h0" in two | still wrong: the total line reads 8,260 for 8,250 everywhere, and 8, 2h0 reads 2 |
| validation-87 | `Total: 73,000` and `Total: 23,000`; both readings' cash 30,000 less change 1,000 is 29,000 | **right** |
| validation-85 | one total line, `Total: 13,000`; `SubTotal: 13,636` in two readings; one reading's cash 20,000 less change 5,000 is 15,000 | **right**, and the tax 1,364 (total less subtotal) |
| validation-63 | the total line is lost in every reading | OCR-bound |

## What changed (`receipts.mjs`)

1. **`NOT_TOTAL_RE`**: `total aty` and `total qt` (OCR's "Total Qty") and any line with
   `kemba` (Kembali, Kembalian: change in Indonesian) are not total lines. "Total Qty" was
   already left out; its misreading was not.
2. **`checkedAcrossReadings`** (called in `parseReceiptPasses` with three or more readings):
   when no check confirms the voted total, and the total is in doubt, an amount the receipt's
   own sums give is taken if it is a read total line with one digit changed. In detail:
   - the sums are cash less change and subtotal plus tax, in any reading (not the items added
     up: on OCR they are noise);
   - "in doubt" means the readings' total lines disagree, or a subtotal read in two readings is
     above the voted total (a total cannot be under its own subtotal);
   - the amount must come from two readings' sums, or from one with such a subtotal between
     the read total and it, and must not be under a subtotal read twice;
   - a total line whose amount starts with 0 ("TOTAL 07,900") lost a digit and is no reference;
   - exactly one amount qualifies.

   The receipt says so: "OCR readings read the total as 73000.00 and 23000.00, which no check
   confirms; took 29000.00, which the receipt's own sums give (one digit from a total line):
   check the total".
3. A tax taken as the total less the subtotal now says that, not "OCR readings disagree on the
   tax (none vs none ...)".

### How the guards were chosen

The first version had only "no check confirms the total" and "two readings, or a subtotal
between". On validation photos it took validation-33 from right to wrong: cash 7,500 (the
printed 57,500 with a digit lost) was one digit from "TOTAL 07,900". The leading-zero guard
came from that. CORD dataset text read as three identical readings then lost train-81
("TOTAL 36,000 / CASH 35,000 / CHANGE 0"), train-710 (cash 15,000 less change 4,000 against
TOTAL 31,000) and test-14 (cash 200,000 less change 18,565 against 281,435). The "in doubt"
guard and the subtotal floor came from those. Test-14's dataset text was in front of us as a
regression check when the guard was written, as in the last notes; the test *photos* were not
scored until the end.

## Results

| set | main (`87b62500b`) | this run |
|---|---|---|
| CORD validation photos, CLI four readings | totals 66 / 98, tax 25 / 3 / 19 | **totals 69, tax 27 / 3 / 17** |
| CORD test photos, scored once | totals 53 / 95, tax 16 / 2 / 23 | same |
| SRD photos, CLI four readings | totals 154 / 196, tax 134 / 11 / 40 | same |
| SRD photos, page (`--settled`) | totals 153; page warned on 38 wrong, 57 right | totals 153; warned on 39 wrong, 58 right |
| CORD text, `parseReceipt`, train / validation / test totals | 749 / 96 / 92 | 749 / **97** / 92 |
| CORD text as three readings, totals | 749 / 96 / 92 | 749 / **97** / 92 |
| CORD text, tax (both ways) | unchanged | unchanged |

Validation photos lost nothing (the scorer's `--misses` lists before and after differ only by
validation-70, -85 and -87 leaving it, and validation-61's wrong total changing from 1,800 to 2).
The validation-text gain is validation-61, whose clean text now reads Total Bayar 8,250.

On test the rule fired on nothing: the gain is validation-only so far. Over 300 photos, three
totals and two taxes came right and none went wrong.

## What is left

- validation-61: "Total Bayar 8, 260" is 8,250 (subtotal 7,500 plus "Pajak Resto (10%)"); a
  whole-unit total under 100 ("8, 2h0" read as 2) could be ruled out, but the remaining
  reading would still be wrong by a digit.
- Test-14 is still wrong on photos for other reasons than the service charge; it stays held out.
- SRD 1022: a change line read as "HANGE".

## Reproduce

```
apt-get install -y tesseract-ocr
python3 -m venv v && v/bin/pip install pyarrow
for s in validation-00000-of-00001-cc3c5779fe22e8ca test-00000-of-00001-9c204eb3f4e11791; do
  curl -LO https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data/$s.parquet; done
v/bin/python -I eval/cord_images.py validation-*.parquet validation photos
v/bin/python -I eval/cord_images.py test-*.parquet test photos
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs photos $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/cord/validation.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 --misses
```

(the scorer skips receipts with no reading, so validation and test may share `$O`). Main's
numbers: `git archive 87b62500b ventures/ai-bookkeeper | tar -x -C old`, copy today's
`eval/cord-receipts.mjs` in, and score from `old/`. Tests: `receipt-crosscheck.test.mjs`
("change and quantity lines are not the total", "a total in doubt is the receipt's own sum one
digit from a total line": both fail on main; "a total every reading agrees on stands against a
short cash line": fails without the leading-zero guard).
