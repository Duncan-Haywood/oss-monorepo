# The page's RapidOCR port on the SRD US photos, after the row-shift rules (2026-11-17)

Flagship item (5), receipts OCR. PR #16883's run ([`rapidocr-srd-misses-2026-11-17.md`](rapidocr-srd-misses-2026-11-17.md))
added the row-shift rules on the Python engine's readings of SRD (ExpressExpense's 196 labelled
US receipt photos) and left one question open: the page reads photos with its own JavaScript
port (`rapidocr-web.mjs`, ONNX Runtime Web), whose model files came from a CDN that session
could not reach. Do the rows shift there too, and what does the page now get right?

This session fetched the two npm tarballs (`onnxruntime-web@1.20.1`, `@gutenye/ocr-models@1.4.2`)
from registry.npmjs.org, which answered, and ran `eval/rapidocr-browser.mjs` (headless Chromium,
the page's canvas path, jsDelivr answered from the tarballs). Photos from `eval/srd-fetch.mjs`
(200 fetched; none committed). Tesseract's four readings: tesseract 5.3.4, `eval/srd-cli.mjs`,
3 shards. Split as before: even-index lines of `eval/srd/labels.jsonl` (99 totals) the choose
half, odd-index (97) held out.

## The port against the Python engine (same photos, this session)

| | value |
|---|---|
| photos whose rows text is byte-identical | 170 / 200 |
| Python's non-empty lines found verbatim in the port's text | 3,974 / 4,045 (98.2%) |
| photos where the row-shift rule fires | Python: 1006, 1150. Port: 1006, 1150 (the same two) |
| speed, 3 browsers on 4 shared cores | 4.8 s a photo each |

So yes: the rows slip the same way in the browser, on the same two photos, and the rule puts
them back there too.

## Totals right (main `parseReceipt`, before this PR's change)

| reader | choose half (99) | held out (97) | all 196 |
|---|---|---|---|
| Python RapidOCR | 95 | 92 | 187 |
| **port in the browser** | **96** | **93** | **189** |
| tesseract four | 81 | 74 | 155 |
| **the page: port then tesseract four (`--settled`)** | **96**, wrong silent 1 | **92**, wrong silent 1 | **188**, wrong silent 2 |

The port beats the Python engine by two (1095 and 1156 are right only in the browser: the
browser's JPEG decoding differs slightly from PIL's, as `rapidocr-web-2026-11-17.md` found).
The page was 184 of 196 when the port shipped; the row-shift rules took it to 188.

## One miss fixed: a printed gratuity (`receipts.mjs`, `totalChecks`)

Reading the port's seven misses on all 196 (both halves, so this is not a held-out result),
SRD 1149 was a parser fault, not an OCR one. The port read every line right:

```
1 Milk Shake  3.99
SubTotal  3.99
Tax  0.30
Gratuity  1.00
Total  5.29
```

Subtotal plus tax is 4.29, one digit from the printed 5.29, and the items plus tax agree, so the
two-checks "one digit apart" fix replaced the right total with 4.29. The gratuity was not in any
check. Now a gratuity line above the total line (no "suggested" wording) adds a check, subtotal
plus tax and gratuity; 5.29 is then confirmed and left alone.

| set | main | this PR |
|---|---|---|
| SRD, port in the browser (all 196) | 189 | **190** |
| SRD, Python RapidOCR | 187 | 188 |
| SRD, tesseract four | 155 | 156 |
| **SRD, the page (port then four)** | 188, wrong silent 2 | **189, wrong silent 1** |
| CORD text, train / validation / test | 767 / 97 / 94 | unchanged |
| SROIE text (625 totals) | 611 | unchanged |

Taxes unchanged everywhere. 1149 sits in the odd (held-out) half, and the change was chosen from
it, so the held-out half is no longer unseen for this rule. No other total moved in any set.

## What the page still gets wrong (7 of 196)

1058 (two columns interleaved), 1073, 1104 (`Foo total: 37,90`), 1115 (`190275.00`), 1126 (a
discount and a printed gratuity between subtotal and an amountless `TOTAL:`), 1191, and 1009.
The port alone misses 1009, 1027, 1058, 1126, 1173, 1190; most are the shapes the earlier run
listed as left over.

## Reproduce

```
npm pack onnxruntime-web@1.20.1 @gutenye/ocr-models@1.4.2   # into <tgz>
node eval/srd-fetch.mjs <photos>
node eval/rapidocr-browser.mjs <photos> <web> <tgz>         # shard by splitting <photos>
for k in 1 2 3; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs <photos> <t> $k/3 & done; wait
awk 'NF && (NR-1)%2==0' eval/srd/labels.jsonl > even.jsonl; awk 'NF && (NR-1)%2==1' eval/srd/labels.jsonl > odd.jsonl
node eval/cord-receipts.mjs even.jsonl --ocr <web>,<t>/psm6,<t>/psm4,<t>/g6,<t>/g4 --settled
```

Test: `receipt-rapidocr-srd.test.mjs`, "a printed gratuity between tax and total" (fails on main).
