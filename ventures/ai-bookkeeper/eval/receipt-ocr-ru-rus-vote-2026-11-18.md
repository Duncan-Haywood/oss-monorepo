# Russian slips: tesseract with Cyrillic as a second reading behind RapidOCR (2026-11-18)

Flagship item (5), receipts OCR. The open item from
[`receipt-ocr-ru-train2-2026-11-18.md`](receipt-ocr-ru-train2-2026-11-18.md) and
[`ocr-time-limit-2026-11-18.md`](ocr-time-limit-2026-11-18.md): RapidOCR reads ИТОГ in Latin
look-alikes (`HTOr`, `HTOI`), so would tesseract's Cyrillic model (`-l rus+eng`, apt
`tesseract-ocr-rus`), read four ways behind RapidOCR's lead, settle the slips RapidOCR gets
wrong? This is the CLI's `receipts photo.jpg --rapidocr --four-pass` with
`RECEIPT_OCR_CMD='tesseract {file} stdout --psm 6 -l rus+eng'`.

**Short answer: no.** The Cyrillic model reads the words, but on these photos tesseract's digits
are too poor to outvote RapidOCR. Behind RapidOCR's lead the four readings gained no total on
val or test and, before the fixes below, lost one slip on each. Both losses had one cause: a line
read as a 0.00 "item" beside one real amount made that amount "the items", a check that let a
wrong total outvote RapidOCR's right one. The two fixes in `receipts.mjs` are the code change.

## How it was run

```
apt-get install tesseract-ocr tesseract-ocr-rus        # tesseract 5.3.4
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/val-00000-of-00001.parquet
v/bin/python -I eval/receipt_ocr_ru.py val-00000-of-00001.parquet val.jsonl photos-val   # labels byte-for-byte as committed
for k in 1 2 3; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py photos-val ocr-val $k 3 & done; wait
for k in 1 2 3 4; do RECEIPT_OCR_CMD='tesseract {file} stdout --psm 6 -l rus+eng' node eval/srd-cli.mjs photos-val tv $k/4 & done; wait
node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr ocr-val,tv/psm6,tv/psm4,tv/g6,tv/g4 --lead --misses
```

`eval/srd-cli.mjs` now honours `RECEIPT_OCR_CMD` (the base command the CLI builds its four
readings from); before, it always read with plain `--psm 6`. Same for the test split. Val was the
development set for the Russian rules; no rule here was written from tesseract's readings before
they were scored.

## Val, 145 labelled totals

| reading | totals right |
|---|---|
| RapidOCR alone (`--rapidocr`, main) | **140** (96.6%) |
| tesseract `--psm 6 -l rus+eng` | 58 |
| `--psm 4` / local threshold, `rus+eng` | 56 |
| grey copy at 2,000 px, `--psm 6`, `rus+eng` | 56 |
| grey copy, second reading, `rus+eng` | 76 |
| `--four-pass`, `rus+eng`, the four voting | 79 (54.5%; English-only four: 68, earlier run) |
| RapidOCR's lead and the four `rus+eng`, voting (`--rapidocr --four-pass`), main | 139: 0 gained, 1 lost |
| the same, with these changes | **140**: 0 gained, 0 lost |

The Cyrillic model lifts tesseract's own vote from 68 to 79 of 145, but that is still far behind
RapidOCR's 140. RapidOCR misses five slips; for each, the four readings either agree with it or
are wrong in other ways:

- `IMG_2003`: three of the four tesseract readings give the right 2000.00. RapidOCR took the
  largest amount on the slip, a fiscal number read as 1,701,306.00. The lead rule
  (`eval/lead-vote-2026-11-17.md`) keeps the lead's total when no arithmetic confirms the
  majority, so the vote keeps the wrong one. A lead that only guessed the largest amount might
  give way to a three-reading majority; that would have to be measured on CORD's 583 train photos,
  which the rule was tuned on, before changing it. Open.
- `IMG_1031`: two readings give the right 624.60, but RapidOCR read a total line (`HTOr: 638.60`).
- `IMG_0821`, `IMG_1061`, `IMG_1480`: no tesseract reading has the right total, or none agree.

### The losses, and the fixes

`IMG_1046` (300.00): RapidOCR got it right from the largest amount. One tesseract reading saw a
single 15.00 item and the card line, `tra БЕЗНАЛИЧНЫМИ -00.00`. `parseItems` took the card line
as a second item at 0.00, so "the items" (15.00 + 0.00) confirmed that reading's 15.00. A total the
receipt's arithmetic confirms may outvote the lead, so the vote took 15.00.

`IMG_0930` (test, 690.00) had the same shape without a payment word: one tesseract reading read a
stray `7153056 0.00` and a fiscal number as `974115.90`, two "items" adding up to the second, and
the vote took 974,115.90.

Two changes:

1. **A card or cash line is a payment, not an item.** `parseItems` already skips `cash`, `card`,
   `paid` and so on (`NOT_ITEM_RE`); it now skips the Russian card and cash words too
   (`RU_PAID_RE`: `БЕЗНАЛИЧНЫМИ`, `НАЛИЧНЫМИ` and the look-alikes RapidOCR prints for them).
2. **One item beside 0.00 lines is no "the items" check.** A single item never made the check
   (two or more were needed); one item plus lines read as 0.00 is the same evidence, and it
   "adds up" only to itself. The check now needs two items that are not 0.00. "The items plus
   tax" keeps the old count. A first version dropped both checks and broke
   `receipt-rapidocr-srd.test.mjs`: a free `No Beverage 0.00` beside a 3.99 shake, where the
   item plus tax is the evidence for correcting a misread total.

Each fix alone settles its own slip; the second also covers `IMG_1046`. `RU_PAID_RE` matches none of the 5,541 lines of the venture's other text, JSONL, CSV and JSON
files. CORD's hand-corrected text is unchanged (train 767/779, validation 97/98, test 94/95), and
RapidOCR alone is unchanged on val (140) and test (137). Tests: `receipt-lead-vote.test.mjs`, two
new tests, both failing on main; the whole ai-bookkeeper suite passes (3,390 tests). Not measured:
the SRD and WildReceipt photo votes, whose readings are not kept in the repository; on those the
second change can only remove an items check where one priced item stood beside 0.00 lines.

## Test, 148 labelled totals

Read the same way after val was scored and the first fix written (the four tesseract readings
took about 25 minutes on 4 cores beside other work). The second fix came from its one loss, so
test is a development set for it.

| reading | totals right |
|---|---|
| RapidOCR alone, main and this change | **137** (92.6%) |
| tesseract `rus+eng`: `--psm 6` / second reading / grey `--psm 6` / grey second | 48 / 65 / 63 / 70 |
| `--four-pass`, `rus+eng`, voting | 86 (main), 87 (this change) |
| RapidOCR's lead and the four, voting, main | 136: 0 gained, 1 lost (`IMG_0930`) |
| the same, with these changes | **137**: 0 gained, 0 lost |

## Why tesseract does badly here, and a reading that did not help

The photos are "enhanced" grey copies with a strong paper texture and a halo round each
character. tesseract's own page layout (`--psm 6`) cuts the texture into word-like noise: the
word ИТОГ appears in 42 of 124 `--psm 6` readings on val. To test whether the layout or the
recognition was at fault, `eval/rowcrop-tesseract.py` lets RapidOCR find the rows and has
tesseract read each row's crop as one line (`--psm 7 -l rus+eng`):

| on the 122 val totals it read (stopped at 124 of 149 photos for time) | totals right | photos with ИТОГ in Cyrillic |
|---|---|---|
| RapidOCR alone | 118 | (prints look-alikes) |
| tesseract `--psm 6 -l rus+eng` | 48 | 42 |
| tesseract grey copy, second reading | 60 | |
| RapidOCR's rows, read by tesseract | **67** | **83** |
| RapidOCR and the row reading (two readings) | 118, no change | |

So the layout was half the trouble: on RapidOCR's rows tesseract finds ИТОГ twice as often. But
its digits stay poor (`=13950.00` read as `=7 3950`, `549.95` as `549 35`, an `=` sign read
as a `5`), so it gives no total RapidOCR lacks. Not wired into the CLI.

## What a user should run

For Russian receipt photos the advice stays `receipts photo.jpg --rapidocr`: 140 of 145 on val.
Adding `--four-pass` (with or without `-l rus+eng`) took 10.9 s on one photo against 1.5 s
(this container, idle) and changed no total on either split. The payment-line fix applies to every reading, so it is in either way.

## Open

- A lead that only guessed the largest amount, against three agreeing readings (`IMG_2003`):
  measure on CORD train before relaxing the lead rule.
- The digits, not the words, now limit tesseract on these photos. A Cyrillic RapidOCR model
  (PaddleOCR's `cyrillic_PP-OCRv3`) is the remaining untried reading.
- `UTOL = 300- oo`: tesseract's ИТОГ with an `L`, an amount split by a dash and `oo` for `00`.
