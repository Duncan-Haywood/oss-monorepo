# CORD train shards 1-3: 600 more unseen receipt photos (2026-11-17)

Flagship item (5), receipts OCR. The last run made CORD-v2's first train shard (200 photos) the
development set for photo rules, because CORD validation had been overused
([`cord-train-photos-2026-11-17.md`](cord-train-photos-2026-11-17.md)). This run read the other
three train shards (600 photos, `train-0000{1,2,3}-of-00004-*.parquet`, revision `7f0115a4`,
Clova AI, CC BY 4.0, not copied here) the way the CLI does (`--four-pass`: tesseract 5.3.4
`--psm 6` and `--psm 4`, then the same on a grey copy at 2,000 px), and wrote rules from
their misses only. 583 of the 600 have a labelled total.

## Before any change

| photos, CLI four readings, main `9e8a814d8` | totals right | tax right / wrong / none |
|---|---|---|
| CORD train shards 1-3 (never seen) | 356 / 583 (61.1%) | 135 / 25 / 107 |
| same, page (`--settled`: what the receipts box shows) | 341 / 583 (58.5%) | 87 / 19 / 161 |

The shards score 61%, close to shard 0's 59% and test's 58%: the unseen-photo rate holds.

Of the 227 misses, the total's digits appear in none of the four readings for 148 (OCR-bound;
the check is loose, so the real number is, if anything, higher). The parser can only reach
the other 79.

## What changed

1. **A whole-unit total ending in `00` and one more digit** (`Total 6.008`, `Total 31.508`)
   is taken as the amount ending `000` when some reading prints that amount on any line
   (`receipts.mjs` `zeroLastDigit`, in `parseReceiptPasses`). In CORD's 972 labelled totals
   (all splits), 8 end that way and 604 end in `000`. The misreads are a last `0` read as
   8, 6, 9 or 3 (train-406, -425, -512, -643, -722) and once a "Before Rounding 110,003"
   line over a total of 110,000 (train-400). A real 6,008 that no reading shows as 6,000
   stands. Dollar receipts are not touched (it needs a whole-unit slip). The receipt's note
   says the total was changed and asks for a check.
2. **The page writes a rupiah total with no line of its own as `Total 110,000`**
   (`photoocr.mjs` `settleTotals`). When the settled total came from the arithmetic or
   another reading's untitled amount, the page added `Total 110000.00`, which a whole-unit
   slip reads back as something else. The page then fell back to "the readings disagree" and
   kept the first reading's wrong total. Now it tries the slip's own style (thousands
   separators, no decimals) first and keeps it only when that reads back as the same total.
   This applies only to totals of 100 units or more: a smaller one is a digit kept from a
   damaged amount (train-249's "Total 1" would have cost a tax). This change made the page
   match the CLI: on train the page was 15 totals behind the CLI and is now 5 behind.

## Results

| set | main `9e8a814d8` | this run |
|---|---|---|
| CORD train shards 1-3, CLI (development) | 356 / 583, tax 135 / 25 / 107 | **362**, tax unchanged |
| CORD train shards 1-3, page | 341; wrong with no warning 37; tax 87 | **357**; wrong with no warning **35**; tax 87 |
| CORD validation photos, CLI | 70 / 98, tax 27 / 4 / 16 | unchanged |
| CORD validation photos, page | 67; wrong with no warning 6 | **70**; 6 |
| **CORD test photos, CLI, scored once** | 55 / 95, tax 16 / 3 / 22 | **56**, tax unchanged |
| **CORD test photos, page, scored once** | 53; wrong with no warning 2 | **55**; 2 |
| CORD text, train / validation / test | 761 / 97 / 93, tax 324 / 46 / 41 | unchanged |
| ai-bookkeeper suite | | 3,300 tests (3 new), all pass |

On the train page, 16 totals were gained and none lost (train-341, -381, -392, -400, -406,
-416, -426, -512, -567, -599, -643, -650, -689, -708, -722, -730). The only tax change was
train-249, before the 100-unit floor was added; with the floor it is unchanged. The held-out
test gain (CLI +1, page +2) is small but goes the same way, and nothing was lost.

SRD (dollar) photos were not re-read: rule 1 needs a whole-unit slip, and rule 2 runs only
when a line in dollar style (`Total 12.00`) does not read back, which on a dollar slip it does.

## Tried and dropped: reading the bottom of the photo

The last note suggested a crop of the bottom third for the OCR-bound misses. On the 149
OCR-bound train misses (after the change), a fifth reading of the bottom 50% (grey, long side
2,000 px, `--psm 6`) printed the total's digits for **5**; the bottom 35% for **4**. Totals on
these photos are lost to blur, fold and angle, not to clutter above them. A crop is not worth
a fifth reading's time on the page. What is left for OCR-bound photos is a different engine
or a model, not more tesseract passes.

## What is left

- 148 of 221 remaining train misses are OCR-bound (above).
- Parser-reachable misses that look like one-digit misreads with nothing to check them
  against: train-569 (`Total 94,000` in all four readings for 34,000), train-644 (5,900 for
  5,000), train-463 (260,000 for 20,000). Without a subtotal or cash line read cleanly, no
  rule can tell.
- train-213 `GRANDTOTAL 4,000` for 42,000 and train-630 `TOTAL $74,255` for 574,255: a lost
  leading digit, the case `checkedAcrossReadings` handles only when a sum confirms it.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
python3 -m venv v && v/bin/pip install pyarrow
H=https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data
for f in train-00001-of-00004-7dbbe248962764c5 train-00002-of-00004-688fe1305a55e5cc train-00003-of-00004-2d0cd200555ed7fd; do
  curl -LO $H/$f.parquet; v/bin/python -I eval/cord_images.py $f.parquet train photos; done
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs photos $O $k/4 & done; wait   # about 11 min on 4 cores
node eval/cord-receipts.mjs eval/cord/train.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 [--settled] --misses
```

The scorer skips receipts with no reading, so these 600 photos score against their own labels.
Validation and test as in [`cord-wrong-totals-2026-11-17.md`](cord-wrong-totals-2026-11-17.md).
Tests: `cord-train-shards.test.mjs`.
