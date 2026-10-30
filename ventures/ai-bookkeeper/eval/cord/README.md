# CORD-v2 receipts

`train.jsonl` (800), `validation.jsonl` (100) and `test.jsonl` (100) are derived from
**CORD v2** by Clova AI (Park et al., "CORD: A Consolidated Receipt Dataset for Post-OCR
Parsing", NeurIPS 2019 Document Intelligence Workshop), licensed **CC BY 4.0**:
https://huggingface.co/datasets/naver-clova-ix/cord-v2 (revision `7f0115a4`, read 2026-10-24).
The receipts are real Indonesian shop and restaurant receipts, photographed; the dataset's
annotators corrected the text of every word box and labelled the fields.

Each line: `id` (split and the dataset's `image_id`), `total`, `subtotal`, `tax` (the labelled
`total.total_price`, `sub_total.subtotal_price`, `sub_total.tax_price`, as printed, or null) and
`text`: the labelled word boxes joined into rows top to bottom, words left to right
(`../cord_text.py`). Changes from the source: images dropped, only these fields kept.

What it is and is not evidence of:

- It tests reading a **real receipt layout**: real total words (`TOTAL`, `TL`, `DUE`, `GRAND TOTAL`),
  cash and change lines, quantity lines, discounts, service charge and Indonesian tax (`PB1`, `PPN`,
  `P.Rest`), and whole-rupiah amounts (`45,500`, `60.000`, `91000`).
- It does **not** test OCR: the text is hand-corrected, so misread characters are not in it.
  Merchant names, addresses and dates are masked in CORD, so only amounts are scored.
- Labels have some noise (one `tax` is `302732003027`, two amounts glued together). The misses are
  left in the score, not removed.

How it was used (2026-10-24): the parser was scored as it stood on all three splits; the rules were
then changed looking only at `train` and `validation` misses; `test` was scored once before the
change and once after. Score: `node eval/cord-receipts.mjs eval/cord/test.jsonl`.
