# CORD train shard 0 through the five-reading vote, and the page's lost rupiah taxes (2026-11-17)

Flagship item (5), receipts OCR. The row's next items were: re-score the CORD photo sets for the
`voteTax` guard ([`rapidocr-web-lead-srd-2026-11-17.md`](rapidocr-web-lead-srd-2026-11-17.md),
which could not reach huggingface.co), and "train shard 4 (200 unread photos) as a fresh check".
CORD-v2 has four train shards, `train-00000` to `train-00003` of `-00004`, and all 800 photos had
been read; the unread one meant here is **shard 0** (`train-00000-of-00004-b4aaeceff1d90ecb`,
200 photos, 196 labelled totals), which tesseract-era rules were written from
([`cord-train-photos-2026-11-17.md`](cord-train-photos-2026-11-17.md)) but which the RapidOCR
parser rules, the lead rule ([`lead-vote-2026-11-17.md`](lead-vote-2026-11-17.md), chosen on
shards 1-3) and the `voteTax` guard (chosen on SRD) had never seen.

## Setup (this session)

- huggingface.co answered: CORD-v2 parquet files at revision `7f0115a4` (Clova AI, CC BY 4.0,
  not copied here), photos written with `eval/cord_images.py`.
- RapidOCR 1.4.4 (Python, `eval/rapidocr-photos.py`) on all 1,000 CORD photos and SRD's 200
  (`eval/srd-fetch.mjs`); tesseract 5.3.4 four readings (`eval/srd-cli.mjs`) on the same.
  About 35 minutes of OCR on 4 cores in all.
- RapidOCR alone reproduced the recorded numbers exactly where there were any with today's parser:
  shards 1-3 539, validation 85, test 83, SRD 188. Shard 0 reads 177 (its only earlier figure,
  172 in `rapidocr-2026-11-17.md`, predates the parser rules written from shards 1-3).

## 1. The voteTax guard on CORD: nothing moves

With the CLI's five readings and the lead (`--lead`), shards 1-3 tax 209 / 17 / 41, validation
41 / 1 / 5, test 32 / 3 / 6: exactly the figures `lead-vote-2026-11-17.md` recorded before the
guard. It needs a gratuity or service line plus three agreeing readings, and no CORD photo
qualifies. Item closed.

## 2. Shard 0, the fresh check of the lead rule

| shard 0, 196 totals / 85 taxes | totals right | tax right / wrong / none |
|---|---|---|
| RapidOCR alone | 177 | 63 / 2 / 20 |
| tesseract's four alone | 124 | 38 / 5 / 42 |
| five readings, lead, main | 175 | 70 / 4 / 11 |
| the page (`--settled`), main | 175, wrong silent 9 | **63 / 2 / 20** |

So on photos the rule never saw, the five-reading vote gave up two totals against RapidOCR alone,
and the page's tax was exactly RapidOCR's alone: none of the seven taxes the other readings added
reached the receipts box.

**The two lost totals.**

- **train-147** (total 17,001): `Subtotal 15.455 / PAJAK 10% 1.546 / Total 17,001 / Rounding -1 /
  FLAZZ 17,000`. Subtotal plus tax is 17,001, but the arithmetic checks in `totalChecks` knew
  `tax`, `gst`, `sst` and `service charge`, not Indonesia's `pajak` or `ppn`, so the sum was no
  check, and `zeroLastDigit` (a whole-unit total ending `00` plus one digit is a misread `000`
  when some line prints that amount) "fixed" it to the 17,000 paid by card. Shards 1-3 have the
  same receipt pattern once (train-692, also 17,001; `lead-vote-2026-11-17.md` listed it as a
  zero-last-digit loss).
- **train-28** (total 8,800): RapidOCR lost the labels (`8.800`, `10.000`, `TUNAT 1.200`);
  tesseract read only `10,000` and `1,200`. A misparsed item line plus the tax made "the items
  plus tax" 10,000, which counted as a confirming check, so the cash amount won. Not fixed: no
  narrow rule separates it from the real items-plus-tax confirmations.

**The lost taxes on the page.** `settleTax` (photoocr.mjs) writes the voted tax into the settled
text as `Tax 8728.00` and keeps it only if the text reads it back. On a whole-unit slip (rupiah,
thousands separators, no decimals) that line does not read back as 8,728, so the tax was dropped
silently, on every CORD set, as the table below shows. `settleTotals` had the same fault for totals
and was fixed on 2026-11-17 (`cord-train-shards-2026-11-17.md`, change 2); the tax path was missed.

## The changes

1. `receipts.mjs` `totalChecks`: `ppn` and `pajak` are tax words for the subtotal-plus-tax check
   (`pb1` was left out: it is matched elsewhere with OCR variants and was not needed here).
2. `receipts.mjs` `parseReceiptPasses`: `zeroLastDigit` stands aside when a check on the receipt
   gives the read total (the receipt's own sums confirm it, so it is no misread).
3. `photoocr.mjs` `settleTax`: when `Tax 8728.00` does not read back, a whole-unit tax is written
   in the slip's style, `Tax 8,728`, and kept if that reads back.

Changes 1 and 2 were written from shard 0's misses, so shard 0 is no longer unseen for them.
Change 3 is a fault fix (the total path already did it); it was found on shard 0.

## Results (totals right; tax right / wrong / none)

| set | mode | main | **this PR** |
|---|---|---|---|
| shard 0 (found here), 196 / 85 | CLI five, lead | 175; 70 / 4 / 11 | **177**; 70 / 4 / 11 |
| | page | 175; 63 / 2 / 20 | **177**; **69 / 4 / 12** |
| shards 1-3, 583 / 267 | CLI five, lead | 542; 209 / 17 / 41 | **543** (train-692); 209 / 17 / 41 |
| | page | 540; 177 / 10 / 80 | **541**; **205 / 14 / 48** |
| validation, 98 / 47 | CLI five, lead | 87; 41 / 1 / 5 | 87; 41 / 1 / 5 |
| | page | 87; 36 / 1 / 10 | 87; **41 / 1 / 5** |
| test (held out), 95 / 41 | CLI five, lead | 83; 32 / 3 / 6 | 83; 32 / 3 / 6 |
| | page | 83; 28 / 1 / 12 | 83; **31 / 3 / 7** |
| SRD US photos, 196 / 185 | CLI five, lead | 188; 162 / 9 / 14 | 188; 162 / 9 / 14 |
| | page | 188; 162 / 9 / 14 | 188; 162 / 9 / 14 |
| CORD hand-corrected text | train / val / test | 767 / 97 / 94 | 767 / 97 / 94 (taxes 324, 46, 41 unchanged) |

(SRD's page here is led by Python RapidOCR, not the browser port, so the 188 differs from the
port's 190 in `rapidocr-web-lead-srd-2026-11-17.md`.)

Read plainly: the page now keeps the tax the five readings agree on for rupiah slips, as the CLI
always did: +28 on shards 1-3, +5 on validation, +6 on shard 0, +3 on held-out test, where two of
the gained taxes are wrong (the CLI's vote gets the same three wrong). The totals gain is two
receipts, both a real total ending in `001`. US photos do not move.

## Integrity notes

- CORD test was scored once with the final code, before and after, and nothing was changed after.
- Shard 0 found all three changes, so its row is not a held-out measure of them; shards 1-3,
  validation, test and SRD did not inform them.
- Every reading here is new (fresh OCR runs); RapidOCR's totals reproduced the earlier runs.

## Reproduce

```
apt-get install -y tesseract-ocr imagemagick
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4 pyarrow
H=https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data
curl -LO $H/train-00000-of-00004-b4aaeceff1d90ecb.parquet
v/bin/python -I eval/cord_images.py train-00000-of-00004-b4aaeceff1d90ecb.parquet train p0
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py p0 r_p0 $k 4 & done; wait
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs p0 t_p0 $k/4 & done; wait
node eval/cord-receipts.mjs eval/cord/train.jsonl --ocr r_p0,t_p0/psm6,t_p0/psm4,t_p0/g6,t_p0/g4 --lead [--settled]
```

Shards 1-3, validation and test the same way from their parquet files (names in
`lead-vote-2026-11-17.md`); SRD photos from `node eval/srd-fetch.mjs`. Tests:
`receipt-shard0.test.mjs` (2, both fail on main).

## Next

- train-28: "the items plus tax" confirming a cash amount when RapidOCR lost every label.
- 1009 (SRD): a lead that read no total line keeps its largest-amount guess over a tesseract
  total line; still open.
- CORD's photo sets are now all read by both engines; the next fresh photos need a new source.
