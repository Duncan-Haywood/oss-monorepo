# The page re-measured, and a cash guess that no longer votes (2026-11-16, evening)

Flagship item (5), receipts OCR. Two open items from
[`cord-photos-four-pass-2026-11-16.md`](cord-photos-four-pass-2026-11-16.md): the page's own
tesseract.js readings were not rebuilt after the 2026-11-16 changes, and on CORD
validation-30 readings that guessed the cash handed over outvoted the total.

## 1. The page after the 2026-11-16 changes

The 200 SRD photos (`eval/srd-fetch.mjs`) were read from scratch with the page's engine
(tesseract.js 5.1.1, `@tesseract.js-data/eng@1.0.0`, the four readings the page makes:
`srd-canvas-grow.mjs`, `canvas-shading.mjs`, `sroie-tesseractjs.mjs` x4, `page-readings.mjs`;
about 11 minutes on 4 cores). They were also read with the CLI's `--four-pass` (tesseract
5.3.4 from Ubuntu, `eval/srd-cli.mjs`, 4 shards). Each version of `receipts.mjs` was scored on
the same readings (`git show <commit>:ventures/ai-bookkeeper/receipts.mjs`).

| `receipts.mjs` at | page totals | page tax right / wrong / none | CLI totals | CLI tax right / wrong / none |
|---|---|---|---|---|
| before 2026-11-16 (`1447ef6f1~1`) | 156 / 196 | 138 / 9 / 38 | 150 | 133 / 12 / 40 |
| total-first vote (#16491, #16633) | 156 | 138 / 9 / 38 | 153 | 134 / 12 / 39 |
| CORD rules (#16642, main) | 156 | 138 / **8** / 39 | 153 | 134 / 12 / 39 |
| **this run** | 156 | 138 / 8 / 39 | 153 | 134 / 12 / 39 |

- **The page reproduces its last measurement** (156 totals, 2026-11-15) and **today's changes
  did not move its totals.** The total-first rules were written from CLI readings, and they
  fire on CLI readings only: +3 totals there, none on the page. The CORD rules turned one
  wrong page tax into none.
- The page's tax is 138 of 185 here against 136 in `receipt-tax-labels-2026-11-15.md`; the
  rules between (#16323 onwards) account for that.
- **The CLI's numbers are one total lower than the last run's** (153 against 154, 134 tax
  against 133, same code). The readings differ: this container's ImageMagick and tesseract
  build are not the ones that run used. Compare commits on one set of readings, not
  across runs.

## 2. A largest-amount guess on the cash line gets no vote

CORD validation-30 (dataset text: two items, 9,000 and 12,000, `TOTAL 21,000`,
`CASH 50,000`, `CHANGE 29,000`). On the photo, readings that lost the TOTAL line fell
back on the largest amount on the page, 50,000, the cash handed over; at half a vote each
(`GUESS_VOTE`) two of them beat the reading that had 21,000.

**Change (`receipts.mjs`):** when the largest-amount fallback picks the amount printed on the
cash line (`CASH`, `TENDERED`, `TUNAI`; not `CHANGE`, `CASH BACK`, `CASHIER`), the note says so,
and in the vote across readings that guess counts 0 (`CASH_GUESS_VOTE`) instead of 0.5,
**unless the receipt's arithmetic gives the same amount**. The exception came from this run's
first version, which broke SRD 1108 on the page: paid with exact cash ("Tendered $52.06",
"Change $0.00"), subtotal 48.54 plus tax 3.52 and the items both give 52.06, and a misread
"Total $5.06" won the tie. With the exception, 1108 is right again. Alone, a cash guess is
still the only candidate and stands, with its note.

| set | before | after |
|---|---|---|
| SRD photos, page readings (196 totals) | 156 | 156 |
| SRD photos, CLI `--four-pass` | 153 | 153 |
| CORD dataset text, train / validation / test totals | 749 / 96 / 92 | same |
| CORD dataset text, tax | 324 / 46 / 41 | same |
| SROIE dataset text (626) | totals 611, merchants 531, dates 601 | same |

On the SRD readings the rule fires on 11 of 1,600 readings (7 photos: page 1004, 1037, 1088,
1097, 1108, 1131; CLI 1004, 1032, 1097, 1108) and changes no outcome. **It is not measured on
validation-30 itself:** huggingface.co returned 403 to this session, so CORD's photos could
not be read again. The fix is written from the previous run's description of the miss, and
`receipt-crosscheck.test.mjs` holds made-up text of the same shape (it fails without the
rule). The next run that reaches huggingface.co should score CORD validation and test with
it (`eval/cord-photos-four-pass-2026-11-16.md`, "Reproduce"); test stays held out.

## Reproduce

```
npm install tesseract.js@5.1.1 @tesseract.js-data/eng@1.0.0   # in a scratch folder
apt-get install -y tesseract-ocr                               # for the CLI readings
node eval/srd-fetch.mjs <photos>
node eval/srd-canvas-grow.mjs <photos> <grey>
node eval/canvas-shading.mjs <photos> <shading.json>
node eval/sroie-tesseractjs.mjs <photos> <ocr> <node_modules> 2          # and <grey> <ocr2>
node eval/sroie-tesseractjs.mjs <photos> <ocrS> <node_modules> 2 --modes psm6 --set thresholding_method=2   # and <grey> <ocr2S>
node eval/page-readings.mjs <shading.json> <ocr> <ocr2> <ocrS> <ocr2S> <page>
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs <photos> <cli> $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <cli>/psm6,<cli>/psm4,<cli>/g6,<cli>/g4 --settled
```

Tests: `receipt-crosscheck.test.mjs` (two new).
