# The page's five-reading vote with its own RapidOCR port as lead, on SRD (2026-11-17)

Flagship item (5), receipts OCR. [`lead-vote-2026-11-17.md`](lead-vote-2026-11-17.md) added the
`lead` rule (the first, stronger engine's total is kept unless the receipt's arithmetic confirms
the majority) and scored the page with **Python** RapidOCR as the lead. The page leads with its
**JavaScript** port (`rapidocr-web.mjs`, ONNX Runtime Web), which reads SRD a little differently
([`rapidocr-web-srd-2026-11-17.md`](rapidocr-web-srd-2026-11-17.md)). That run left two items
open: re-score with the port as lead, and find out why SRD lost two taxes with the lead.

## Setup (this session)

- SRD photos: `node eval/srd-fetch.mjs` (200 fetched from raw.githubusercontent.com; none committed).
- The port: `eval/rapidocr-browser.mjs` in headless Chromium, npm tarballs `onnxruntime-web@1.20.1`
  and `@gutenye/ocr-models@1.4.2` from registry.npmjs.org; 2 browsers, about 8 minutes.
- Tesseract 5.3.4 (apt), four readings, `eval/srd-cli.mjs`, 4 shards, about 45 minutes.
- huggingface.co refused connections from this session, so CORD photos could not be fetched and
  the CORD photo sets were **not** re-scored (see "Not checked").

The port alone reproduced the previous run's 190 of 196 totals exactly (tax 148 / 7 / 30).

## Results on SRD's 196 labelled totals (185 labelled taxes)

| | totals right | tax right / wrong / none |
|---|---|---|
| port alone | 190 | 148 / 7 / 30 |
| five readings, no lead (CLI parse) | 188 | 167 / 9 / 9 |
| five readings, no lead, **the page** (`--settled`) | 189, wrong silent 1 | 167 / 9 / 9 |
| five readings, port as lead, main | 190 | 165 / 10 / 10 |
| **the page with the port as lead, main** (what ships) | **190**, wrong silent 1 | 165 / 10 / 10 |
| the page with the port as lead, **this PR** | **190**, wrong silent 1 | **166 / 9 / 10** |

So, with its own engine leading, the page gets 190 of 196 SRD totals: the same as the port alone,
and one more than the vote without the lead rule. The lead rule fixes 1027 (the majority's 30.00
was wrong; the lead's 44.31 is also wrong, see below), 1073, 1104 and 1115, and loses 1009, 1027's
tax and 1173.

## Why the lead lost two taxes

**1009** (tax 2.28, total 30.76). The port read `Tax` and `Total` with no amounts, so its total
is "no total line; took the largest amount": the subtotal, 28.48. One tesseract reading printed
`Total $30.76`; nothing confirms it, so the lead rule keeps 28.48 and the tax (derived as total
less subtotal without the lead) is lost with it. A rule that lets a total-line reading beat a
lead that read no total line would fix this receipt, but on CORD train the closest variant ("keep
the lead only when it read a total line") scored 540 against 542, and train could not be re-read
here. Left as is; the page still warns on this total ("kept 28.48 ... check the total").

**1027** (tax 1.86, total 41.31): a parser fault, fixed here. Hawaii breakfast slip:

```
Subtotal $42.75
Ohana Discount Breakfast -3.30
HI HNLK0 4.712% GET 1.86
Total $41.31
Gratuity 3.00
Total 44.31
```

All five readings read the tax as 1.86. The lead's total is 44.31 (the second total line, with
the gratuity). `voteTax`'s "one digit from the total less a subtotal" fix then saw 44.31 − 42.75 =
1.56, one digit from 1.86, and replaced a tax all five readings agree on with 1.56. The gap is a
discount plus a gratuity, not a misread digit.

**The change** (`receipts.mjs`, `voteTax`): that fix is skipped when three or more readings read
the same tax **and** some reading prints a service charge or gratuity line, so the gap has more in
it than the tax. Agreement alone was tried first and broke an existing test: three readings of
`Tax 8.21` where 42.16 less 38.95 is 3.21 must still be repaired, because tesseract repeats a
misread digit across its readings (the correlated misreads `lead-vote-2026-11-17.md` describes). Result: 1027's tax right with the lead (165 → 166), nothing else on
SRD moves (totals unchanged in all four modes; no-lead taxes unchanged at 167).

1027's total stays wrong either way: the label is 41.31 (before the gratuity); the lead reads the
last total line, 44.31, and the tesseract majority 30.00 (a misread column).

## Not checked

- **CORD photo sets** (train shards 1-3, validation, test; five readings each): the tax rule
  change can only move receipts with three or more readings, and those readings need the CORD
  parquet files from huggingface.co, which refused this session. CORD's hand-corrected text
  (one reading) is unchanged: train 767/779, validation 97/98, test 94/95 totals; taxes 324, 46, 41.
- SROIE has no tax labels and is scored with two readings, so it cannot move.
- The change was chosen on SRD, all 196, so SRD is not a held-out check of it.

## Reproduce

```
npm pack onnxruntime-web@1.20.1 @gutenye/ocr-models@1.4.2      # into <tgz>
node eval/srd-fetch.mjs <photos>
node eval/rapidocr-browser.mjs <photos> <web> <tgz>            # split <photos> to run 2 at once
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs <photos> <t> $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <web>,<t>/psm6,<t>/psm4,<t>/g6,<t>/g4 --lead --settled
```

Test: `receipt-lead-vote.test.mjs`, "a tax most readings agree on is not 'fixed' to the total less
the subtotal" (fails on main).
