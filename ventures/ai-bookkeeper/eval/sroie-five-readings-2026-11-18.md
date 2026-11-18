# SROIE's 626 scans through RapidOCR and the five-reading vote; dates glued to the time (2026-11-18)

Flagship item (5), receipts OCR. huggingface.co refused this session, so the row's CORD,
WildReceipt and Russian items could not be read. SROIE 2019 (ICDAR, 626 Malaysian shop receipts,
merchant, date and total labelled by hand) is on GitHub (`zzzDavid/ICDAR-2019-SROIE`, MIT) and
had only been read by tesseract (README, "Totals checked against the receipt's own arithmetic"),
never by RapidOCR, the five readings or the lead rule. The lead rule was chosen on CORD train
(`lead-vote-2026-11-17.md`), so SROIE is fresh for it, and for every RapidOCR parser rule since.

## Setup (this session)

- `git clone --depth 1 --filter=blob:none --sparse https://github.com/zzzDavid/ICDAR-2019-SROIE`,
  `git sparse-checkout set data/img data/key data/box` (626 scans; nothing copied here).
- RapidOCR 1.4.4 (`eval/rapidocr-photos.py`, 4 shards, ~25 min) and tesseract 5.3.4's four
  readings (`eval/srd-cli.mjs`, `OMP_THREAD_LIMIT=1`, ~30 min) on all 626; SRD's 200 photos the
  same way (`eval/srd-fetch.mjs`, raw.githubusercontent.com).
- `eval/sroie-receipts.mjs` takes `--lead` now (it scored only two readings before), so merchant
  and date are scored with the five readings as the CLI's `--rapidocr --four-pass` reads them.
- **Split, fixed before any change:** ids sorted, the first 313 (`000`-`312`) are dev, where
  misses were read and rules written; the last 313 (`313`-`625`) are held out, scored once on
  main and once with the final code. SROIE has no tax labels.

## 1. What the five readings do on fresh scans (main, before any change)

| main | dev 313: date right / wrong / none | dev total right | held out 313: date | held-out total |
|---|---|---|---|---|
| RapidOCR alone | 197 / 32 / 75 of 304 | 279 of 312 | 212 / 34 / 61 of 307 | 299 of 313 |
| tesseract's four | 251 / 29 / 24 | 248 | 242 / 34 / 31 | 274 |
| five readings, no lead | (follows RapidOCR) | 270 | | 294 |
| **five readings, lead** (CLI) | 197 / 32 / 75 | **282** | 212 / 34 / 61 | **302** |
| the page (`--settled`, lead) | 197 / 32 / 75 | 281 | 212 / 34 / 61 | 302 |

The lead rule holds up on a source it never saw: +12 totals on dev and +8 held out over the vote
without it, and above RapidOCR alone on both (+3, +3). Totals are 96.5% right on the held-out
half.

Dates were the fault: 65-69% right with RapidOCR leading, below tesseract's own 79-83%, because
merchant and date follow the first reading.

## 2. The fault: RapidOCR glues the date to the time

RapidOCR drops the space between the date and the clock time printed after it:

- `Date:  25/12/20188:13:39PM` (000): the date patterns want no digit after the year, so no date;
- `18-11-1813:58SH01Z153` (004): read as 18 November **1813**;
- `05Mar201818:24` (030): the month-name pattern wants spaces, so no date;
- `CB#:389772  17/01/20188.08.53` (212), `06/01/1812.17:26PM` (067): a clock with dots.

## The changes

1. `receipts.mjs` `unglueDate`: before the date patterns, a 20xx year glued to a clock time is
   split off, then a two-digit year glued to one (`H:MM`, or `H.MM.SS` / `H.MM:SS`), and a month
   name glued to its day and year gets its spaces back. The day-or-month-first guess
   (`dayFirstOf`) reads the unglued lines too, so `25/01/2018 1:22` tells it the day comes first.
2. A date before 1990 is not a candidate (a misread, never a receipt's date).
3. The SRD 1009 lead item from `cord-shard0-lead-2026-11-17.md`, "Next": a lead that read no total
   line and took its largest amount gives way to the vote's total line when that amount is a
   subtotal some reading prints and the total line is above it by at most 35% (tax and a tip). SRD
   1009: RapidOCR read `Tax` and `Total` with no amounts, so took 28.48, the subtotal, over one
   tesseract reading's `Total $30.76`. The 35% cap came from SRD 1164, where without it "I agree to
   pay above total 133" replaced a right 22.70 in the CLI. The broader version tried before ("keep
   the lead only when it read a total line") lost 2 on CORD train; this one could not be run on CORD
   (huggingface.co refused), so it is narrower on purpose: it needs the subtotal match.

## Results

| set | mode | main | **this PR** |
|---|---|---|---|
| SROIE dev 313 | five, lead: date right / wrong / none | 197 / 32 / 75 | **284 / 7 / 13** (93.4%) |
| | totals | 282 | 282 |
| **SROIE held out 313** | five, lead: date | 212 / 34 / 61 (69.1%) | **289 / 11 / 7 (94.1%)** |
| | totals (CLI and page) | 302 | 302 |
| | RapidOCR alone: date | 212 | 289 |
| SRD 196 / 185 | CLI five, lead: totals; tax right / wrong / none | 188; 164 / 9 / 12 | **189**; **165** / 9 / 11 |
| | page (`--settled`) | 188; 164 / 9 / 12 | **189**; **165** / 9 / 11 |
| SROIE box text 626 | totals, dates | 609 / 625, 601 / 611 | same |
| CORD hand-corrected text | train / val / test totals; taxes | 767 / 97 / 94; 328, 46, 41 | same |

(SRD here is led by Python RapidOCR, as in `cord-shard0-lead-2026-11-17.md`, so its 188 matches
that note, not the browser port's 190.)

Read plainly: with RapidOCR leading, three receipt dates in ten were missing or wrong on these
Malaysian receipts; now one in seventeen is. On the held-out half wrong dates fell from 34 to 11.
Totals do not move on SROIE; SRD gains 1009's total and tax.

## Integrity notes

- The held-out half was scored once on main and once with the final code; nothing was changed
  after. Change 3 was written from SRD 1009 and tightened on SRD 1164 (both SRD), so SRD is no held-out
  measure of it; SROIE did not inform it, and it moves no SROIE receipt in either half.
- CORD photos could not be re-read (huggingface.co refused), so change 3 is unmeasured on CORD's
  1,000 photos. Its conditions (the lead's guess equals a printed subtotal and the total line is
  within 35% above it) are why it is expected to be rare there; a later run with CORD access should
  re-score the four CORD sets.
- `labelDate` in the scorer reads SROIE labels day first, so a month-first label (`12/28/2017`,
  013) scores as a miss although the reader is right; the counts above include that.

## Reproduce

```
apt-get install -y tesseract-ocr imagemagick
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4
git clone --depth 1 --filter=blob:none --sparse https://github.com/zzzDavid/ICDAR-2019-SROIE sroie
(cd sroie && git sparse-checkout set data/img data/key data/box)
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py sroie/data/img r $k 4 & done; wait
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs sroie/data/img t $k/4 & done; wait
# dev / held: a folder per half with key/ (symlinks to sroie/data/key/<id>.json for ids 000-312 / 313-625)
node eval/sroie-receipts.mjs <half> --ocr r,t/psm6,t/psm4,t/g6,t/g4 --lead [--settled] [--misses date]
node eval/srd-fetch.mjs srd   # then the same two OCR loops on srd/, and
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr sr,st/psm6,st/psm4,st/g6,st/g4 --lead [--settled]
```

Tests: `receipt-sroie-five.test.mjs` (5; the file fails on main, which has no `unglueDate`, and the 1009 test fails with change 3 switched off).

## Next

- Merchant names with RapidOCR leading: 67.4% exact on dev against 84.8% from SROIE's box text;
  the reader follows the first reading's merchant, so RapidOCR's glued words (`SOONHUAT2000`)
  likely cost it. Dev's misses first, the held-out half once.
- Re-score CORD's four photo sets for change 3 when huggingface.co answers.
- 1027 (SRD): a 44.31 total line where the label is 41.31, still open.
