# Receipt tax on the CLI: misspelt labels and damaged tax lines (2026-11-16)

Flagship item (5), the "BUILDABLE HERE" note in `portfolio/flagships.yaml`: the CLI's
`receipts FILE --four-pass` read tax on 126 of the 185 SRD photos that print one, with 45
reading none (`receipt-cli-four-pass-2026-11-16.md`). This session installed tesseract
5.3.4 (`apt-get install -y tesseract-ocr`), fetched the 200 photos (`eval/srd-fetch.mjs`)
and re-read them with `eval/srd-cli.mjs` (4 shards, about 25 minutes). The readings
reproduced the last run's figures exactly (totals 150, tax 126 / 14 wrong / 45 none), so
the change below is measured against the same text.

## What the 45 missing taxes looked like

Each photo's four readings were printed with their subtotal, tax and total lines. Most of
the misses are OCR-bound: no reading holds a tax amount at all (1026, 1034, 1039, 1041,
1044, 1087, 1093, 1095, 1114, 1156, 1181 read no tax, subtotal or total line in any of the
four), or the total itself is wrong, which also rules out the subtotal-to-total check.
Three patterns were fixable:

| pattern | example (photo) | fix |
|---|---|---|
| subtotal label misspelt | "Suototal 24.08" (1061), "Subtota \| $20.00" (1076), "Subtota\| $28.48" (1009) | `cleanOcr`: a word one letter from "subtotal" or "subtota", 7+ letters, is "Subtotal" |
| total label or decimal damaged | "Grand Tota] $25.78" (1076), "TOTAL: 146..57" (1133) | `cleanOcr`: "Tota]" / "Tota\|" to "Total"; "146..57" to "146.57" |
| tax digits with no decimal point | "TAX 211" (1012) | `looseTax`: 2.11 when a subtotal plus it is a total line |
| tax amount gone, rate printed | "TAX 8.00% 44" (1064) | `looseTax`: the total split at the rate, the line's last digits agreeing |

Why one letter and not two: two-letter neighbours of "subtotal" include "SOSTOTAL", which is
photo 1133's total line, and "satotal", "pubtotel", "wbtota" (each once). One letter covers
"Subtota" (31 readings), "ubtotal" (3), "Suototal" (3), "Sudtotal", "Suctotal", "Subtotel",
"Subtotat", "Sibtotal", "Suttota", "Subtote".

## Results

| SRD, CLI `--four-pass` | before | after |
|---|---|---|
| tax right (185) | 126 | **132** |
| tax wrong / none | 14 / 45 | 12 / 41 |
| tax read where none labelled | 1 | 1 |
| totals right (196) | 150 | **151** (1076) |
| item splits kept (200) | 48 | **49** |

Gains: 1009, 1012, 1064, 1076 (none to right), 1061, 1153 (wrong to right). None lost.

| held out (scored once, after) | before | after |
|---|---|---|
| CORD train / validation / test tax | 322 / 46 / 41 | **323** / 46 / 41 |
| CORD totals | 749 / 96 / 92 | unchanged |
| SROIE merchant / date / total, dataset text | 531 / 601 / 611 | unchanged |

CORD's receipts are mostly whole-unit rupiah, where the two tax-line fallbacks never run
(they need a receipt written 12.50), so the held-out sets test the label repair only.

**Tried and dropped.** "Tax » 415.35" and "Tax - 715.35" on photo 1184 (total 193.35):
the amount less its first digit (15.35) as the tax. It changed nothing on 1184, because
the subtotal-arithmetic rule then picked 193.35 less a misread "176.00" (17.35, one digit
from 15.35). It also turned photo 1142's missing tax into a wrong 0.06 on a misread total.

## Left for the next run

- tax missing, total right (14): 1013, 1018, 1032, 1034, 1044, 1055, 1070, 1114, 1134,
  1159, 1162, 1180, 1192, 1199. 1018 ("TAX 8.25% 2. og", total 2.17) would split as 2.00 +
  0.17, but the line's digits do not agree, so it is left. 1070 and 1162 show a tax line
  with no amount and no subtotal read. 1159 has a subtotal and total but no tax line.
- tax missing, total wrong (27): 1003, 1006, 1019, 1022, 1026, 1030, 1035, 1039, 1041,
  1053, 1056, 1063, 1067, 1073, 1087, 1093, 1095, 1104, 1111, 1133, 1142, 1156, 1169,
  1172, 1181, 1189, 1191. These need the total first. 1133's total line reads "SOSTOTAL";
  1191 and 1172 read the subtotal and a tax line but not the total.
- tax wrong, total right (7): 1028, 1112, 1171, 1178, 1182, 1184, 1198. Mostly a digit
  misread in most readings (1178 "0.31" three times against 0.91; 1028 "2.87" twice).
  1184 is the case above.
- tax wrong, total wrong (5): 1000, 1058, 1084, 1126, 1177.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
node eval/srd-fetch.mjs $P
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs $P $O $k/4 & done; wait
node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr $O/psm6,$O/psm4,$O/g6,$O/g4
for f in train validation test; do node eval/cord-receipts.mjs eval/cord/$f.jsonl; done
node eval/sroie-receipts.mjs <ICDAR-2019-SROIE clone>/data
```

Before: `git stash` the change to `receipts.mjs` and `cleanocr.mjs`. Item splits: a short
script running `parseReceiptPasses` on each photo's four readings and counting `itemsOk`.
