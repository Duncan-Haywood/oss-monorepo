# WildReceipt shard 1: the four tax shapes left open (2026-11-17)

Follows [`wildreceipt-train1-2026-11-17.md`](wildreceipt-train1-2026-11-17.md), whose "Next"
listed four tax misses. Each is now read by `receipts.mjs`:

| Shape (photo label) | Before | Now | Change |
|---|---|---|---|
| `Total HTVA 69.06`, `TVA10.00% 45.73) 4.57`, `TVA20.00% 23.33) 4.67`, total 78.30 (train1 `2372aea0`) | total 69.06, tax 4.67 when the TTC line is lost | total 78.30, tax 9.24 | `Total HT(VA)` is a not-total and a subtotal (`HT_SUB_RE`), so the two-line sum check closes |
| `HT TIC TUA` over `LOCAL 412.50 20% 495,00`, tax 82.50 (train1 `3925c8ad`, train0 `5c263e37`) | no tax | 82.50 | `taxColumn` takes a header with HT, TTC and a bent TVA, and reads a row in mixed decimal marks |
| `Subtotal(12%VAT) Php32.14`, total 300.00, tax 32.14 (train1 `0877edc4`) | no tax | 32.14 | a subtotal line with `N%VAT` whose amount is the total's VAT at N% (within 1 cent) is the tax; the subtotal is the rest |
| tax `0.00` on a `0.00` total (seven test, several train labels) | no tax | 0.00 | a zero tax is kept when the total is zero too |

`VAT5%: 668` with its decimal point lost on a comma-free slip was not touched: nothing on the
line tells 6.68 from 668 without the photo's other readings.

## What was and was not measured

The RapidOCR and tesseract readings of the WildReceipt photos are not committed and
huggingface.co refused this session, so the shard and the held-out test were **not re-scored**.
Each fix is held by a test written in the photo's shape (`receipt-wildreceipt-train1.test.mjs`,
four new tests, each with a negative case). The reachable text corpora show no side effects:

| Corpus | Before | After |
|---|---|---|
| CORD validation text | total 97/98, tax 46/47 | same |
| CORD train text | total 767/779, tax 325/352 | same |
| CORD test text | total 94/95, tax 41/41 | same |
| SROIE 626 (zzzDavid/ICDAR-2019-SROIE boxes) | total 609/625, date 601/611 | same |

Reproduce: `node eval/cord-receipts.mjs eval/cord/<split>.jsonl`;
`node eval/sroie-receipts.mjs <clone>/data` (sparse clone of `data/box`, `data/key`).
A run with Hugging Face access should re-score shard 1 and the test set with the commands in
`wildreceipt-train1-2026-11-17.md`; the expected gain is 3 to 4 taxes and one total on shard 1.
