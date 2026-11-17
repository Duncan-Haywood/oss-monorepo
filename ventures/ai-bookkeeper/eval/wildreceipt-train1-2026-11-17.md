# WildReceipt train shard 1: 633 fresh development photos, and the tax lines they showed (2026-11-17)

Flagship item (5), receipts OCR. The [first WildReceipt run](wildreceipt-2026-11-17.md) left
train shard 1 (`train-00001-of-00002`, 633 photos) unread as "a fresh development set", and
named three open groups: rates glued to tax words (`CATAX9.0000%`), net / tax / gross column
rows, and `EC$`/`US$` read as `ECS`/`USS`. This run read shard 1, wrote rules from its misses
only, and scored the held-out test once with main and once with the final code.

## Setup (this session)

- huggingface.co answered; `kaydee/wildreceipt` `data/train-00001-of-00002.parquet` (490 MB)
  and `data/test-00000-of-00001.parquet` (427 MB). `eval/wildreceipt.py` wrote
  [`wildreceipt/train1.jsonl`](wildreceipt/train1.jsonl): 633 receipts, 538 single-answer
  totals (4 with two amounts), 335 taxes (44 with two), 423 subtotals. Rewriting the test labels
  from the parquet gave a file byte-identical to `wildreceipt/test.jsonl`.
- RapidOCR 1.4.4 (`eval/rapidocr-photos.py`) and tesseract 5.3.4's four readings
  (`eval/srd-cli.mjs`), 4 shards each, on train1, test and SRD's 200 US photos; scored with
  `eval/cord-receipts.mjs`. About 95 minutes of OCR on 4 cores.

## What the misses showed

RapidOCR alone on shard 1, main: 235 of 335 taxes right, 87 unread. Read by hand from the
miss list (lines that mention a tax word, a percentage or a net/gross word):

- **Target's state tax line glued to its state code** (7 receipts): `T=CTTAX 6.3500%on $117.15
  $7.44`, `T=NJTAX7.0000%on $24.98 $1.75`, `T=FLTAX 6.0000%0n$377.34 $22.65`, `T=ALTAX`,
  `=C0TAX2.9000%`, `TATAX9.50...`. This is the row's `CATAX9.0000%`: the state code, not the
  rate, is what hides the word `TAX`.
- **Net / tax / gross rows** (5, one with the tax amount lost: `34.17 20.00% 41.00`): `VATABL 566.96 68.04 635.00` under `Net.Amt VAT Amount`;
  `A21,00% 5,45 1,15 6,60` under `CODE HTVA TVA TTC`; a row under `[V.A.T Analysis]`;
  `VAT total: 39.38 7.88 56.53`. The parser took the last amount (the gross), which is the
  total, so nothing was kept.
- **"Total includes GST of"** (4): `TOTAL INCLUDES GST OF 0.26`, `Totalincludes GSTof: $7.68`,
  `GST INCLUDED IN TOTAL $1.37`. The first run made these not-totals; their amount is the tax,
  but the tax reader still skipped any line with a total word.
- **Other glued words** (5): French `TVA8% *8.44`, `TVA10.00% *1.14`; the Canary Islands'
  `IGIC7% 2.46`; a rate before the word, `20.600TAX 0.98`; `TAXIAMT $8.16`.
- Totals: `Total Savin9s: 66.00` (a savings line, the `g` read as `9`) and `VAT Incuded in
  total: 16.18` were taken as totals. Most other total misses are OCR-bound (`Total 11.21` for
  111.21, `TOTAL(D) S3.57` beside a lost line) or label choices (a Malaysian total labelled before
  its rounding).

`EC$`/`US$`: no shard-1 photo printed them, but `cleanOcr` turned a correctly read `US$12.50`
into `U5$12.50` and `ECS161.04` into `EC5161.04` (the look-alike pass reads `S` as `5` in a
mostly-digit token). Written from shard 0's note and the code, not from a miss here.

## The changes

1. `TAX_LINE_RE` (`receipts.mjs`): a two-letter code glued to `TAX` before a rate
   (`(?<![a-z])[a-z][a-z0]tax(?=\s*\d)`; three letters, as in `SURTAX`, are not taken), `TVA`
   and `IGIC` glued to a digit, `IGIC` as a word, a tax word right after a digit, and
   `TAXAMT`.
2. `taxColumn`: a line with a tax word, or under a header of tax words with no digits,
   whose last three amounts are net, tax and gross (net + tax = gross, tax under half the net)
   gives the middle amount as a tax candidate; with two amounts and a rate between them
   (`34.17 20.00% 41.00` under `Sales-VAT VAT Rate VAT Amt Total`, the tax amount lost) it
   gives the gross less the net when the net at that rate makes the gross, to a cent. Not on
   whole-unit (rupiah) slips, not on subtotal, cash, change or tip lines.
3. `INCLUDED_TAX_RE`: a "total includes GST/tax/VAT of" or "GST included in total" line is a
   tax line even though it holds a total word.
4. `NOT_TOTAL_RE`: `sav...in9s`; `VAT ... inc...ded in total`.
5. `cleanOcr` (`cleanocr.mjs`): `US$`, `EC$`, `HK$`, `NZ$`, `AU$`, `SG$`, `NT$`, `CA$`, `BZ$`,
   `TT$`, `JM$`, `BB$`, `BS$`, `FJ$`, `A$`, `C$`, `S$`, and the same with the `$` read as `S`
   before an amount, are written `$`, so the look-alike pass leaves the amount alone.

Tests: `receipt-wildreceipt-train1.test.mjs` (6 tests, all 6 failing on main; receipt text made
up in the photos' style). The whole ai-bookkeeper suite passes (3,366 tests).

## Results

Totals right; tax right / wrong / none; "unl." is a tax read where none is labelled.

| set | mode | main | **this PR** |
|---|---|---|---|
| WildReceipt train1 (development), 538 / 335 | RapidOCR | 465; 235 / 13 / 87; unl. 46 | **466; 256 / 13 / 66**; unl. 48 |
| | tesseract four | 373; 208 / 26 / 101 | 373; **212** / 26 / 97 |
| | five, lead (CLI) | 472; 262 / 22 / 51; unl. 70 | 472; **273 / 20 / 42**; unl. 70 |
| | page | 471; 262 / 22 / 51 | 471; **273 / 20 / 42** |
| **WildReceipt test (held out)**, 405 / 272 | RapidOCR | 358; 185 / 12 / 75; unl. 36 | **359; 187 / 12 / 73**; unl. 40 |
| | tesseract four | 294; 154 / 27 / 91 | 294; 155 / 27 / 90 |
| | five, lead (CLI) | 359; 204 / 16 / 52; unl. 50 | **360; 207 / 16 / 49**; unl. 53 |
| | page | 358; 202 / 16 / 54; unl. 49 | **359; 205 / 16 / 51**; unl. 52 |
| SRD US photos, 196 / 185 | RapidOCR; tesseract four; five, lead; page | 188; 152 / 9 / 24 &middot; 157; 135 &middot; 188; 164 / 9 / 12 &middot; 188; 164 | unchanged (no receipt changes in RapidOCR alone) |
| CORD hand-corrected text | train / val / test | 767 / 97 / 94; tax 325 / 46 / 41 | unchanged |

On the development shard every changed receipt was checked: RapidOCR alone changes 25 results,
22 to the labelled answer. The two others are real tax lines WildReceipt left untagged (a
two-rate TVA slip whose tax is labelled null, and a Florida return); one total moved from one
wrong answer to another (`Total: 11.21` read for 111.21).

Read plainly: on the development shard the CLI reads 11 more taxes of 335 and RapidOCR alone 21
more; on the held-out test the CLI reads **3 more taxes of 272 (204 to 207) and 1 more total of
405 (359 to 360)**, the page the same. Counted without listing ids, RapidOCR alone changes 9 test results: 2 taxes
and 1 total to the label, 1 wrong tax to another wrong amount, 5 taxes read where none is
labelled (4 new, 1 changed), and no right answer to a wrong one. That is a much
smaller gain than on the shard the rules came from. A likely reason, not checked (checking
would mean reading test receipts): the largest group (Target's `T=CTTAX` line, 7 receipts) is
one chain's layout and helps only where that chain's receipts are, and the VAT-table and
"includes GST" groups were 4 and 5 receipts of 633.
Main's numbers here are exactly those the first WildReceipt run reported after its changes, so
the OCR reproduces from run to run.

"Tax read where none labelled" rose by 3 to 4 on the test. Those receipts were not read (that
would spend the test set); on the development shard the same rise was two real tax lines the
labels left blank.

## Integrity notes

- The held-out test was scored with main (a copy of `receipts.mjs` and `cleanocr.mjs` at the
  branch point) and with the final code, once each, after the rules were fixed. No test miss
  list was printed and no test receipt was read in this run.
- The first WildReceipt run had read four test receipts and printed its test miss list before
  that run's changes; none of this run's rules came from those (they came from shard 1's miss
  list, printed in this session, and the `EC$` note).
- SRD and CORD did not inform the changes; they are regression checks.
- No WildReceipt text or photo is in the repository, only amounts.

## Reproduce

```
apt-get install -y tesseract-ocr imagemagick
python3 -m venv v && v/bin/pip install rapidocr-onnxruntime==1.4.4 pyarrow
H=https://huggingface.co/datasets/kaydee/wildreceipt/resolve/main/data
curl -LO $H/train-00001-of-00002.parquet
v/bin/python -I eval/wildreceipt.py train-00001-of-00002.parquet eval/wildreceipt/train1.jsonl w1
for k in 1 2 3 4; do OMP_NUM_THREADS=1 v/bin/python eval/rapidocr-photos.py w1 r_w1 $k 4 & done; wait
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs w1 t_w1 $k/4 & done; wait
node eval/cord-receipts.mjs eval/wildreceipt/train1.jsonl --ocr r_w1,t_w1/psm6,t_w1/psm4,t_w1/g6,t_w1/g4 --lead [--settled]
```

The test set the same way (see [`wildreceipt-2026-11-17.md`](wildreceipt-2026-11-17.md)).

## Next

Every WildReceipt photo has now been read (test, train shards 0 and 1). Left from shard 1's
misses, none large on its own:

- Two tax lines at two rates (`TVA10.00% 45.73) 4.57`, `TVA20.00% 23.33) 4.67`) where only
  one is kept: the sum (9.24) makes `Total HTVA 69.06` the total `78.30`, but the "HTVA" total
  is a not-total, so the sum check finds no subtotal.
- `TVA` read as `TUA` (`HT TIC TUA` header, `LOCAL 412.50 20% 495,00`): a header word OCR
  bends.
- Tax inside a subtotal line (`Subtotal(12%VAT) Php32.14`, Philippine VAT), and `VAT5%: 668`
  with the decimal point lost on a comma-free slip.
- A tax of `0.00` on a receipt whose total is `0.00` is dropped (the tax must be under the
  total).
- The remaining total misses are mostly OCR-bound (digits lost, the total line split from its
  amount). A fresh source is what would say more now: the train shards are spent as development
  sets and the test set is spent by two runs' scoring.
