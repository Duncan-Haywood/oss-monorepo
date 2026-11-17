# SRD 1022: a change line read as HANGE, a stray TL, a total under its subtotal (2026-11-17)

Flagship item (5), receipts OCR. The last two notes
([`cord-wrong-totals-2026-11-17.md`](cord-wrong-totals-2026-11-17.md),
[`service-charge-vote-2026-11-17.md`](service-charge-vote-2026-11-17.md)) left SRD 1022 open:
"a change line read as HANGE (`totalChecks` looks for `change|kembali|baki`)".

## The receipt

ExpressExpense 1022 (Moonstar Restaurant), printed cleanly: SUBTOTAL 29.88, 15% SERVICE
CHARGE 4.48, Tax(8.75%) 3.01, SALES TOTAL 32.89, TOTAL 37.37, CASH 100.00, CHANGE 62.63.
Label: total 37.37, tax 3.01.

The CLI's four readings (tesseract 5, `eval/srd-cli.mjs`) and what each parsed to on main:

| reading | lines that matter | parsed total |
|---|---|---|
| psm6 | `Tax(8.75% 3.01`, `Pep: yh \ 37.37` (no total word) | 37.37, a largest-amount guess (half vote) |
| psm4 | `SUBTOTAL: 29.88`, `aueges TOTAL: 7.07`, `CASH: 100,00`, `CHANGE 62.63` | 7.07, a total line (2 points) |
| g6 | `pHLES ITAL: \ 32,89`, `TOTAL: BT re` | 29.88, a guess |
| g4 | `Tax (8.75%): 44 Of tl Bit.`, `CASH: 100.00`, `HANGE 62.63`, `CHANGE bere` | 8.75, the tax line as a total line |

Main settled on 7.07 and no tax.

## Three things in the way, all needed

1. **`HANGE`.** g4's cash less change (100.00 − 62.63 = 37.37) was lost because the change
   pattern wanted `change`; the next line, `CHANGE bere`, has no amount. `CHANGE_WORD` now also
   takes `hange` (the C lost), in `totalChecks` and in the two other change lookups. A bare
   `ange` is not taken: SRD 1002 reads Orange Crush as `'ange Crsh`, and 1097's `ange Due` also
   reads as a total line (`due`); 1097's change amounts are unreadable anyway and its g4 reads
   `Change Due 0.13` whole. Over all 800 SRD readings: `HANGE` once, `ange` 5 times, `Change`/
   `CHANGE`/`change` 52.
2. **A stray `tl`.** `TL` is in `TOTAL_RE` (tills that print TL for total). g4's tax line
   carries the noise `tl`, so it became g4's total line (8.75, with a total-line point) and was
   dropped as a tax candidate. A `tl` after a tax word (tax, gst, vat, sst) on the same line no
   longer counts; `TL 12.50` alone still does.
3. **A total under its own subtotal.** psm4 reads `SUBTOTAL: 29.88` above its `TOTAL: 7.07`.
   In `voteTotal` that reading's total line now loses its extra total-line point (it keeps
   its one vote as a reading) when some reading's cash less change is above that subtotal.

With all three: 37.37 has cash less change (1 point of support) plus psm6's guess (0.5);
7.07 has 1; 8.75 is gone. 37.37 wins, and the tax vote then takes 3.01.

Ablation on SRD (one rule left out at a time): any two of the three leave 1022 at 7.07, so
SRD stays at 154.

### The first version of rule 3 was too wide

Without the cash-less-change condition, rule 3 changed two CORD validation photos, both
already wrong: validation-61 from 2 ("Total Bayar | 8, 2h0") to 8,260 (label 8,250), with its
tax going from none to a wrong 460 (label 750), and validation-78 from 77,870 (label 177,870)
to 154,000, its subtotal. Nothing came right. A condition on any backed amount above the
subtotal (any check kind) still fired on both. Requiring some reading's **cash less change**
above the subtotal (or cash less change and subtotal plus tax together) fires on 1022 only. The
cash-only version is kept: it is the narrower reason (the money handed over says more was
paid than the total line reads).

## Results (`receipts.mjs` as merged; main is `ef336de3e`)

| set | main | now |
|---|---|---|
| SRD photos, CLI four readings, totals | 154 / 196 | **155 / 196** |
| same, tax right / wrong / none | 134 / 11 / 40 | **135 / 11 / 39** |
| SRD photos, page (two readings, `--settled`) | 124 / 196 | 124 / 196 |
| CORD validation photos, four readings, totals | 69 / 98 | 69 / 98 |
| same, tax | 27 / 3 / 17 | 27 / 3 / 17 |
| CORD test photos (held out, scored once at the end) | 53 / 95, tax 16 / 2 / 23 | same |
| CORD text: validation, train, test | 97/98, 749/779, 92/95 | same |
| SROIE box text (626 receipts) | totals 611 / 625 | same |

A per-receipt comparison of main and this branch over every SRD and CORD-validation photo
(both totals and taxes) shows exactly one receipt changed: 1022, 7.07/none to 37.37/3.01.

## What is left

- validation-61: "Total Bayar 8, 260" is 8,250 (unchanged here).
- Test-14 on photos (held out).
- SRD wrong totals with no total line read at all (`line: null` in `--misses`): 31 of the 41.
  Each looked at this run is wrong for its own reason (1097's `Payment yol2`, 1006's lost
  decimal point); no shared pattern turned up.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr     # ImageMagick was already installed
node eval/srd-fetch.mjs $P
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 --misses
```

CORD photos: as in [`cord-wrong-totals-2026-11-17.md`](cord-wrong-totals-2026-11-17.md)
("Reproduce"); huggingface.co answered this session. SROIE:
`git clone --depth 1 --filter=blob:none --sparse https://github.com/zzzDavid/ICDAR-2019-SROIE`,
`git sparse-checkout set data/box data/key`, then `node eval/sroie-receipts.mjs <clone>/data`.
Each of the four reading runs took about 25 minutes on 4 shards. Tests:
`receipt-crosscheck.test.mjs` (three new tests).
