# Receipt totals: the total-first rules on held-out scans (2026-11-16, evening)

PR #16491 added two rules to the CLI's total vote (`receipts.mjs`, `voteTotal`; README,
"Reading the total first"), both written from the 200 SRD photos, and said there was no
held-out multi-reading set. SROIE's 625 labelled scans read by the CLI's `--four-pass` are one
(they were used that way in `guess-vote-2026-11-15.md`), and the CORD photos
(`eval/cord_images.py`) need huggingface.co, which refused this session's proxy (403).

This run: tesseract 5.3.4, the 626 SROIE scans (zzzDavid/ICDAR-2019-SROIE, MIT, not copied
here) read with `eval/srd-cli.mjs` in 4 shards (about 11 minutes), then scored with
`eval/sroie-receipts.mjs --ocr` four ways, swapping `receipts.mjs` only.

## Results

| CLI `--four-pass` | before #16491 | #16491 | this run |
|---|---|---|---|
| SROIE totals right (625, held out) | 521 (83.4%) | 520 (83.2%) | **521 (83.4%)** |
| SROIE merchants exact / dates right | 288 / 493 | 288 / 493 | 288 / 493 |
| SRD totals right (196, in-sample) | 151 | 154 | **154** |
| SRD tax right (185) | 132 | 133 | **133** |

(SROIE's 521 before is above the 516 recorded on 2026-11-15: rules landed between those
runs, and this run re-read every scan.)

## What the held-out set showed

- **Rule 1 (subtotal plus tax, printed on the page) never fires on SROIE.** These Malaysian
  receipts print GST inside the total ("Bill Inclusive of 6% GST") and their total lines
  survive OCR, so no reading's subtotal plus tax is a missing total. On SRD it fires on
  exactly the two photos it was written for (1002, 1133). Held out, it is harmless and
  untested.
- **Rule 2 (a total line with a leading 0 counts as a guess) cost one receipt.** SROIE 169
  reads "Grand Total 029,30" in one reading (the label is RM29.30) and "Grand Total VAS, x
  30" in the other three. The 0 is a stray mark in front of an intact total, not a lost
  first digit, and with the line's vote halved the 3.00 guesses ("sHerb.J RH3.00") won.
  It is the only SROIE reading with a leading-zero total line.
- **The fix:** a leading-zero total is demoted only when another reading holds the same
  digits with a digit in front (94.78 for "04.78", SRD 1030). SROIE 169 is right again,
  SRD keeps all three of #16491's gains, and nothing else moved.
  Test: `receipt-crosscheck.test.mjs` (fails on #16491's rule, passes now).

So on 625 held-out scans the two rules gain nothing and, narrowed, lose nothing. Their
+3 on SRD remains an in-sample figure. A held-out set that exercises them needs US-style
receipts with a separate tax line read several times: the CORD photos (Indonesian, tax
lines common) when huggingface.co answers, or the page's own readings.

## Reproduce

```
apt-get update && apt-get install -y tesseract-ocr
git clone --depth=1 --filter=blob:none --sparse https://github.com/zzzDavid/ICDAR-2019-SROIE.git s
(cd s && git sparse-checkout set data)
for k in 1 2 3 4; do OMP_THREAD_LIMIT=1 node eval/srd-cli.mjs s/data/img $O $k/4 & done; wait
node eval/sroie-receipts.mjs s/data --ocr $O/psm6,$O/psm4,$O/g6,$O/g4 [--misses total]
```

Before: `git show f898a36b1:ventures/ai-bookkeeper/receipts.mjs > receipts.mjs` (before
#16491) or `1447ef6f1` (#16491); restore after.
