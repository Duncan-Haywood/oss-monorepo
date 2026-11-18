# The "tesseract hangs" on Russian receipt photos was OpenMP, not the photos (2026-11-18)

Flagship item (5), receipts OCR. [`receipt-ocr-ru-2026-11-18.md`](receipt-ocr-ru-2026-11-18.md)
reported that `tesseract photo.jpg stdout --psm 6`, the CLI's default reading, ran over 9 minutes
of CPU on each of the cdek-ocr/receipt-ocr-ru photos without printing, and blamed the photos'
paper texture. It asked for a time limit on the OCR command. This run measured the hang first.

## What causes it

tesseract 5.3.4 (Ubuntu's, built with OpenMP 201511), 4 cores, val photo `IMG_0793_enh.jpg`
(1200 x 1600):

| how tesseract ran | time |
|---|---|
| alone | 0.92 s |
| alone, `OMP_THREAD_LIMIT=1` | 0.85 s |
| alone, with three shell busy-loops on the other cores | **over 30 s, stopped** |
| the same, `OMP_THREAD_LIMIT=1` | 0.85 s |
| 2 photos at once | **both over 60 s, stopped** |
| 4 at once / 12 at once | all over 60 s, stopped |
| 12 at once, `OMP_THREAD_LIMIT=1` | 3.1 s for all 12 |

The photos are fine. tesseract's OpenMP build starts a thread per core, and its threads spin
while they wait for each other. When anything else wants a core (another tesseract, the RapidOCR
workers the earlier run had going beside it, a browser, a build), the read slows by a factor
of more than 30 and looks hung. `OMP_THREAD_LIMIT=1` is tesseract's own advice for running several at
once, and the README's scanned-statement section had already seen the same thing ("two tesseract
processes at once ... slowed to minutes a page"). Crops, thresholds and a PNG copy of the photo
all read in about 1 s once the limit was set. They were tried first and are not needed.

A person on a laptop with a browser open could hit this with `receipts photo.jpg`. On the code
on main, with three busy-loops running, `receiptTextFromFile` on the photo above was still running after 60 s and was
stopped. With this change it returns 32 lines in 0.89 s.

## The change (`ocr.mjs`)

- `ocrRunOptions`: every OCR command the CLI runs (a receipt photo through tesseract or
  `RECEIPT_OCR_CMD`, RapidOCR's `rapidocr_rows.py`, a scanned statement page through tesseract
  or `STATEMENT_OCR_CMD`) gets `OMP_THREAD_LIMIT=1` unless the user's environment already sets
  it.
- A time limit, `OCR_TIMEOUT` seconds (default 120, `0` for none). A read that still runs out
  of time is killed, and the CLI prints `could not read slip.jpg: tesseract gave no reading within 120 s and was stopped (set
  OCR_TIMEOUT ...)` instead of hanging.
- When one pass runs out of time, the other passes of that photo are skipped (`--two-pass`, `--four-pass`), since they would stall too.
  With `--rapidocr --four-pass`, a tesseract that fails or runs out of time leaves RapidOCR's
  reading instead of failing the receipt.

Tests: `ocr-time-limit.test.mjs` (6 tests; real child processes, a shell script standing in
for the engine: it sees `OMP_THREAD_LIMIT=1`, a `sleep 30` is stopped at 0.5 s with the
message, the lead survives, a statement page stops, a timed-out pass stops the passes after it, `OCR_TIMEOUT=0`). The whole
ai-bookkeeper suite passes (3,385 tests).

## What tesseract reads on these photos, now that it can run

Val split, 145 labelled totals, `node eval/srd-cli.mjs` (the CLI's `--four-pass`; 4 shards at
once, which is what hung before) then `node eval/cord-receipts.mjs eval/receipt-ocr-ru/val.jsonl
--ocr ...`. All 149 photos read in 323 s with no time-outs.

| reading | totals right |
|---|---|
| `--psm 6` (the CLI's default) | 51 (35.2%) |
| `--psm 4` / local threshold (second reading) | 54 (37.2%) |
| grey copy at 2,000 px, `--psm 6` | 52 (35.9%) |
| grey copy, second reading | 66 (45.5%) |
| `--four-pass`, the four voting | **68 (46.9%)** |
| `--psm 6 -l rus+eng` (`RECEIPT_OCR_CMD`, apt `tesseract-ocr-rus`) | 57 (39.3%); 6 photos over 10 s, none timed out |
| RapidOCR, `--rapidocr` (earlier run) | 138 (95.2%) |

So on Russian slips tesseract is far behind RapidOCR, and the Cyrillic model helps only a little
(51 to 57, single pass). For these receipts the advice stays `--rapidocr`. The val split was the
earlier run's development set, but no rule here was written from tesseract's readings, so these
are first looks, not tuned figures.

## Open

- Why tesseract misses: its readings of the ИТОГ lines were not read here. With `-l rus+eng` the
  words come out in Cyrillic, so the misses are more likely to be digits than words.
- `rus+eng` through `--four-pass`, and as the second engine behind RapidOCR's lead.
- Train shard 2 (233 photos) is still unread.
