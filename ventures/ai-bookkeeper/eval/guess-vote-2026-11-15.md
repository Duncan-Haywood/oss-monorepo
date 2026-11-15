# A guessed total counts half in the vote (2026-11-15)

Flagship item (5), "vote picks 145 of 169". Engines as in
[`shaded-photos-2026-11-15.md`](shaded-photos-2026-11-15.md): tesseract.js 5.1.1 with
`@tesseract.js-data/eng@1.0.0` for the page, the tesseract 5.3.4 binary (Ubuntu
`tesseract-ocr`, `OMP_THREAD_LIMIT=1`) for the CLI. No photo is committed here.

## What was wrong

The page reads each photo four times and the readings vote on the total
(`voteTotal` in `receipts.mjs`): one point per reading that read a value, one more per
reading that printed it on a total line, plus one per kind of arithmetic check that
gives it. A reading that found no total line falls back on the largest amount on the
page, and on a phone photo that is usually the cash handed over, a card number or noise.
Three readings agreeing on such a guess scored 3 and beat the one reading that printed
the real total on a TOTAL line (2).

The SRD misses the change fixed, in reading order (`[line]` = read from a total line,
`[guess]` = the largest amount):

| photo | reading 1 | reading 2 | reading 3 | reading 4 | right |
|---|---|---|---|---|---|
| 1123 | 19.75 guess | 19.75 guess | **21.76 line** | 19.75 guess | 21.76 |
| 1027 | 42.75 guess | **41.31 line** | 42.75 guess | 42.75 guess | 41.31 |
| 1064 | 18.00 guess | 2480.00 guess | 18.00 guess | **19.44 line** | 19.44 |
| 1161 | 11.11 guess | 50.49 guess | **53.23 line** | 50.49 guess | 53.23 |
| 1137 | 11.49 guess | 12.94 guess | 14.17 guess | 12.94 guess | 14.17 (subtotal plus tax and the items confirm it) |

## The change

A reading whose total is only the largest-amount fallback (no total line, the note "no
total line; took the largest amount") now scores `GUESS_VOTE` = 0.5 instead of 1.
Everything else in the vote is unchanged; with two readings (`--two-pass`, the
hand-corrected CORD and SROIE scores) the vote is not used at all.

## Chosen on the even half, scored on the odd half

Page, SRD, readings laid out as the page makes them (`eval/canvas-shading.mjs`,
`eval/page-readings.mjs`), settled as the page settles them. The weight of a total
line was varied too:

| guess weight | line weight | even (of 99) | odd (of 97) |
|---|---|---|---|
| 1 (before) | 1 | 72 | 73 |
| 1 | 1.5 | 73 | 74 |
| 1 | 2 | 71 | 74 |
| 0.75 | 1 | 73 | 75 |
| 0.75 | 1.5 | 73 | 77 |
| **0.5** | **1** | **73** | **77** |
| 0.5 | 1.5 | 71 | 77 |
| 0.25 | 1 | 73 | 78 |
| 0 | 1 | 71 | 78 |

Five settings tie at 73 on the even half. The line weight was kept at 1 (no change)
and 0.5, the middle of the three tied guess weights, was taken. Honest caveat: the odd
column was printed by the same grid run, so it was visible when picking among the
tied settings; every one of the tied settings scores 74 to 78 on it, against 73 before.

## Results

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 145 (74.0%) | **150 (76.5%)** |
| page, SRD odd half (held out) | 73 of 97 | **77** |
| page, SROIE scans, 625 (second held-out set) | 529 (84.6%) | 529 (84.6%) |
| CLI `--four-pass`, SRD 196 | 146 (74.5%) | 147 (75.0%) |
| CLI `--four-pass`, SRD even half | 74 of 99 | 76 |
| CLI `--four-pass`, SRD odd half (held out) | 72 of 97 | **71** |
| CLI `--four-pass`, SROIE 625 | 514 (82.2%) | **516 (82.6%)** |

Page: 5 photos fixed, none broken. Wrong totals with no warning stay at 3 of 196; tax
78 of 185 before and after (the earlier record says 79; this run's OCR reproduces 145
totals exactly and 78 tax). SROIE: merchant, date and total all unchanged (one wrong
total moved to within 5 cents of the label).

CLI: two photos fixed (1018, 1070) and one broken (1157: the right 9.70 was a guess in
one reading, and a garbled "AROUNT Due" total line read 44.00 in another). The binary's
readings differ from tesseract.js's, so a weight chosen on the page's readings is a
small, mixed change on SRD: +1 overall, -1 on the held-out half. On SROIE's scans (held
out for both engines) the CLI gains 2 totals (514 reproduces the earlier record; merchant
288 and date 493 unchanged), so the change was kept for the CLI as well.

"Vote picks 145 of 169" before: of the 166 SRD photos where the right total appears in
some reading's text (this run's count; the earlier record's 169 counted differently),
the page now picks it on 150.

## What is left in the gap

17 SRD photos still have the right total somewhere in the page's text and lose. Most
(1002, 1018, 1038, 1055, 1073, 1082, 1180, 1186, 1196) have no reading with a total
line at all, so nothing in the vote separates the right guess from the wrong ones. Two
are OCR letter swaps on the total line (1177: "Balance Due A7.90" read twice as 7.90
against one clean 47.90; 1086: 167.61 against 157.61). Not tried this run.

## Reproduce

```
node eval/srd-fetch.mjs <photos>
node eval/srd-canvas-grow.mjs <photos> <grey>
node eval/canvas-shading.mjs <photos> <shading.json>
npm install tesseract.js@5.1.1 @tesseract.js-data/eng@1.0.0   # anywhere
node eval/sroie-tesseractjs.mjs <photos> <ocr> <node_modules>
node eval/sroie-tesseractjs.mjs <grey> <ocr2> <node_modules>
node eval/sroie-tesseractjs.mjs <photos> <ocrS> <node_modules> 4 --modes psm6 --set thresholding_method=2
node eval/sroie-tesseractjs.mjs <grey> <ocr2S> <node_modules> 4 --modes psm6 --set thresholding_method=2
node eval/page-readings.mjs <shading.json> <ocr> <ocr2> <ocrS> <ocr2S> <page>
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <page>/r1,<page>/r2,<page>/r3,<page>/r4 --settled
```

SROIE the same way on `<clone>/data/img` (only the shaded scans need the Sauvola
readings), scored with `node eval/sroie-receipts.mjs <clone>/data --ocr <page>/r1,...
--settled`. CLI: `node eval/srd-cli.mjs <photos> <out> [k/n]`, then `node
eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <out>/psm6,<out>/psm4,<out>/g6,<out>/g4`.
Before: `git stash` the change to `receipts.mjs` and score the same readings again.
