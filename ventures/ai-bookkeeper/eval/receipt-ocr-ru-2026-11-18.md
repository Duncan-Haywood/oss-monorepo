# Receipts from a fresh labelled source: Russian fiscal slips (2026-11-18)

Flagship item (5), receipts OCR. The flagship row's `buildable:` list asked for "a fresh labelled
source" after WildReceipt, CORD, SROIE and SRD had been read through and their misses had
mostly become OCR-bound. This run went looking for one on Hugging Face.

## Sources checked and turned down

Two sets looked new but are copies of sets already read here:

- **shirastromer/supermarket-receipts** (Apache-2.0, 192 photos, Label Studio labels): 167 of
  192 receipts carry the same total and subtotal as a CORD-v2 receipt, and the photos have CORD's
  blurred shop names. It is CORD re-labelled.
- **docjay131/receipts-ocr-dataset** (MIT, 230 US photos, labels written by Gemini): 199 of 230
  totals match an ExpressExpense SRD or WildReceipt receipt (WinCo, Hollywood Cafe, Pizza Hut).
  It is mostly SRD again, and its labels are a model's, not a person's.

Others were synthetic (wasanx/receipt-4k, masterofaudio2077/egyptian-receipts-ocr,
DuckerMaster/Thai-Synth-Receipts), non-commercial (IngCrowd/japanese-receipts-*, CC BY-NC), or
scraped from a price site with "research purposes only" on the card
(Sigurdur/neytandinn-receipts). None of those was used.

## The source used

**[cdek-ocr/receipt-ocr-ru](https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru)** (MIT on
its card; about 1,000 phone photos of Russian shop receipts: Lenta, Perekrestok, Spar, small
sole traders, the St Petersburg metro; labelled "human, machine-assisted": seller, INN, date,
total and item lines). The photos come as "enhanced" grey copies, 1200 x 1600. There is no tax
label, so only totals are scored. The parquet files' val, test and train splits are not the
`annotations/` folder's, and they share no photo (one of train shard 0's 233 photos is also in
val). As a check on the machine-assisted labels, `eval/receipt_ocr_ru.py` records whether the
labelled item sums make the labelled total: they do on 138 of 145 val totals, 134 of 148 test,
211 of 231 train shard 0 and 211 of 230 train shard 1. Misses are scored against the labels as
they stand. The labels are in [`receipt-ocr-ru/`](receipt-ocr-ru/); the photos are not committed.

```
python3 -m venv v && v/bin/pip install pyarrow rapidocr-onnxruntime==1.4.4
curl -LO https://huggingface.co/datasets/cdek-ocr/receipt-ocr-ru/resolve/main/data/val-00000-of-00001.parquet
v/bin/python -I eval/receipt_ocr_ru.py val-00000-of-00001.parquet eval/receipt-ocr-ru/val.jsonl photos-val
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py photos-val ocr-val $k 4 & done; wait
node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl --ocr ocr-val --misses
```

Only RapidOCR (the CLI's `--rapidocr`, the page's lead reading) was scored. About 8 minutes per
233 photos on 4 cores.

**tesseract did not finish.** `tesseract photo.jpg stdout --psm 6`, the CLI's default reading,
ran for over 9 minutes of CPU on each of the first two photos without printing, and was
stopped. The enhanced copies have a busy paper-texture background that tesseract's layout step
cuts into thousands of pieces. A person running `receipts photo.jpg` on such a photo would see
the command hang: the CLI has no time limit on the OCR command. That is an open item (below),
not something this run fixed.

## Before any change

RapidOCR's default model has no Cyrillic, so it prints Russian in Latin look-alikes: `ИТОГ`
(total) comes out as `HTOr`, `MTOr`, `NTOr`, `UTOr`, `WTOr`, `VTOr`, `ИTOr` or `MTOF`, and
`ИТОГО К ОПЛАТЕ` (total to pay) as `MTOrO K OnMATE`. The parser knew no Russian total word, so
every total it got right came from its fallback, the largest amount on the slip. That fallback
did well, because a Russian slip prints its total several times (ИТОГ, the card or cash line,
a bare `=413.00`) and rarely prints a bigger number:

| set | role | totals right, main |
|---|---|---|
| val, 145 labelled | development | 120 (82.8%) |
| test, 148 | held out, first look | 126 (85.1%) |
| train shard 0, 231 | second development set (see below) | 198 (85.7%) |
| train shard 1, 230 | held out, untouched until the end | 187 (81.3%) |

## What the misses showed (val)

All 25 val misses had no total line. Read by hand:

- The ИТОГ line was there in look-alikes (8 receipts).
- `ИТОГО без скидки` (the total before the discount; `6e3 CKHAKH`) sits above the real ИТОГ.
- The engine drops a kopeck digit or both on the ИТОГ line: `VTOr 27.0`, `HTOrO. 2644.`.
- The engine's rows are one off on some slips: the ИТОГ row carries the last item's price
  (`UTOr =50.00`, the total `=413.00` on the card line and a bare line below), or the total
  drifts up a row (`TOBAP -819.00` over `HTOr =39.00`), or a digit is misread on the ИТОГ line
  (`HTOr 119.00` over three `109.00`s).
- Card and cash lines (`БЕЗНАЛИЧНЫМИ`, `НАЛИЧНЫМИ`) print as `6E3HAnM4H6IMM`,
  `BE3HANV-HbIMA`, `HAJMHHIMM`, `HANINYHDIMN`.

## The changes (`receipts.mjs`)

1. `RU_TOTAL_RE`, part of `TOTAL_RE`: `итог`, `итого`, `к оплате`, and the look-alikes
   (`[hmnuwvи][tт][oо0][rгf][oо0]?` with no letter on either side). JavaScript's `\b` does not
   see Cyrillic letters, so the word is bounded by lookarounds. No line of the CORD, SRD,
   WildReceipt text or the venture's fixtures (12,521 lines) matches it.
2. `NOT_TOTAL_RE`: `без ск...` (before the discount) is not the total.
3. On a Russian total line (`ruTotalLine`): a dropped kopeck digit is a zero; an item's
   `119.00*1` (price times quantity) is not an amount; with two amounts the larger is the total
   (`UTOr =439.00 =20.91`, the tax row's amount beside it).
4. When the ИТОГ amount is printed only once from the ИТОГ line down (a bare copy right above
   also counts), and is not two amounts below it added (a card payment and an advance, `АВАНС`):
   the one amount printed on two or more of those lines, more often than any other, is the
   total; failing that, the one card or cash line's amount, unless change was given; with
   change, an amount below that is another one less the change. Each of these leaves a note
   ("check the total").

Tests: `receipt-russian.test.mjs` (7 tests, 5 failing on main; receipt text made up in the
photos' style). The whole ai-bookkeeper suite passes (3,379 tests).

## Results

| set | main | this PR |
|---|---|---|
| val (development) | 120 / 145 | **138** (95.2%) |
| test (held out; misses seen after the first score) | 126 / 148 | **136** (91.9%) |
| train shard 0 (233 photos, second development set) | 198 / 231 | **213** (92.2%) |
| **train shard 1 (held out, scored once, at the end)** | 187 / 230 | **203 (88.3%)** |

On the receipts whose labelled items make their total (the labels least likely to be wrong),
train shard 1 goes from 172 to 184 of 211.

How clean each number is: the test set was first scored with changes 1 and 2, the digit fill in 3 and the repeat rule (135, from 126; val was 137 then), and its two losses
(a misread ИТОГ with the right amount once on the card line, a row-shifted ИТОГ with the right
amount on the cash line) were read. The payment-line rule came from them, so the test set's
final 136 is not a clean held-out figure. Train shard 0 was then read as a fresh set with that rule added: 208, 15 gained
and 5 lost. Three of its five losses had causes the rules could handle (a card plus advance that add
up to the ИТОГ; a tax amount or an item price on the ИТОГ row), and they were fixed from it, so
it became a development set too. **Train shard 1 is the clean figure**: downloaded and read only
after the last change, then scored once, 187 to 203 of 230, 20 gained and 4 lost:

- `IMG_0741`, `IMG_0774`: a digit misread on the ИТОГ line itself (`392.66` for 392.86, `747.80`
  for 747.90). The fallback had happened to take the right amount elsewhere on the slip.
- `IMG_1150`: the ИТОГ line read `677.00`, right, but the repeat rule replaced it with an amount
  printed twice below.
- `IMG_0917`: `HTOr 26.00` on a row the engine merged; the fallback had been right.

No total on CORD's hand-corrected text moved (train, validation, test).

## Open items

- **tesseract hangs on textured photos** (above). A time limit on the OCR command, or a crop to
  the paper before reading, would turn a hang into a message or a reading. Measure it on these
  photos first.
- A Cyrillic RapidOCR model (PaddleOCR publishes `cyrillic_PP-OCRv3`) or `tesseract -l rus+eng`
  (`RECEIPT_OCR_CMD` already passes `-l`) would read the words, not look-alikes. Not tried here.
- The repeat rule's one wrong replacement (`IMG_1150`) and the misread digits on the ИТОГ line:
  the slip's other copies of the total could vote with it, as the five-reading vote does.
- Tax: Russian slips print `СУММА НДС 20% =108.35` (VAT); this set has no tax label.
- Train shard 2 (233 photos) is still unread: a clean set for the next change.
