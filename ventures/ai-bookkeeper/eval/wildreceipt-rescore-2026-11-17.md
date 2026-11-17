# WildReceipt re-scored: the four tax shapes, and VAT tables with a row per rate (2026-11-17)

[`wildreceipt-tax-shapes-2026-11-17.md`](wildreceipt-tax-shapes-2026-11-17.md) (PR #17047)
added four tax rules from train shard 1's misses (`Total HTVA`, a `HT TIC TUA` header,
`Subtotal(12%VAT)`, a `0.00` tax on a `0.00` slip). It could not score them because
huggingface.co refused that session. This session could reach it. Shard 1 and the held-out
test were read again and scored with three versions of `receipts.mjs`:

- **before**: main before #17047 (`6b92b54fc^`);
- **#17047**: main at the start of this run;
- **this run**: #17047 plus one rule found while re-scoring (below).

## Setup

huggingface.co answered. `kaydee/wildreceipt`'s `train-00001-of-00002.parquet` and
`test-00000-of-00001.parquet` went through `eval/wildreceipt.py`. The labels it wrote were
byte-identical to `wildreceipt/train1.jsonl` and `wildreceipt/test.jsonl`. RapidOCR 1.4.4
and tesseract 5.3.4's four readings, 4 shards each on 4 cores, took about 45 minutes. The
commands are the ones in [`wildreceipt-train1-2026-11-17.md`](wildreceipt-train1-2026-11-17.md).
Every "before" figure below matches what that run reported for its own final code, so the
OCR reproduces from session to session.

## What the re-score showed on shard 1 (development)

`eval/receipt-version-diff.mjs` lists the receipts whose total or tax changes between two
parser copies. With RapidOCR alone, #17047 changed 7 receipts:

- 3 taxes now match the label: the Philippine `Subtotal(12%VAT)` (32.14), the `HT TIC TUA`
  row (82.50) and a `0.00` slip.
- `2372aea0` (`Total HTVA`, two TVA rates) now reads 9.24, the sum of both rates. WildReceipt
  leaves this tax unlabelled because the receipt prints two tax amounts. Its total was
  already right in RapidOCR's reading, so the one total the last note expected did not appear.
- 3 taxes read where none is labelled. The photos were read by eye: all 3 are real tax lines
  that WildReceipt left untagged. One is a `GST@6 0.00` on a voided Pizza Hut slip, which
  reads correctly as 0.00. The other two are VAT tables with **one row per rate**, and
  #17047 kept only the first row:

  ```
  HT  TUA  TIC                       EXCT.BTW  BTW%  IncI.BTW
  TUA5.50%  10.26  95'0  10.82       21,45  21%  4,50  25.95
  TUA10.00%  9.07  0.91  9.98        9966  12%  11,95  111,50
  TOTAL 20.80                        Totaal 137,45
  ```

  The parser read 0.56 of 1.47 and 4.50 of 16.45.

## The rule added here

Each row in such a table checks itself (net + tax = gross, or the net at the row's rate
gives the gross). The rows' gross amounts add up to the receipt total: 10.82 + 9.98 = 20.80,
and 25.95 + 111.50 = 137.45. So, in `readTax` / `taxColumn` (`receipts.mjs`):

1. A line right under a table row is read as a table row too, under the same header. That is
   how the French second row `TUA10.00% 9.07 0.91 9.98` gets read: it has no tax word of its
   own.
2. A row of rate, tax and gross whose net was lost (`9966 12% 11,95 111,50`, the net's comma
   gone) is read when the gross split at that rate gives the tax, to a cent.
3. When two or more table rows' grosses make the total (within a cent), and no printed tax
   total exists, the tax is every row's tax added. If the grosses do not make the total,
   nothing changes.

Tests: `receipt-wildreceipt-train1.test.mjs`, "a VAT table with two rate rows ...". It has
both shapes plus a negative case where the grosses do not make the total. It fails on
#17047's code. The whole ai-bookkeeper suite passes (3,371 tests).

## Results

Totals right; tax right / wrong / none; "unl." means a tax read where none is labelled.

| set | mode | before | #17047 | **this run** |
|---|---|---|---|---|
| train1 (development), 538 / 335 | RapidOCR | 466; 256 / 13 / 66; unl. 48 | 466; 259 / 13 / 63; unl. 51 | 466; 259 / 13 / 63; unl. 51 (2 unlabelled taxes now right) |
| | tesseract four | 373; 212 / 26 / 97 | | 373; 213 / 26 / 96 |
| | five, lead (CLI) | 472; 273 / 20 / 42; unl. 70 | 472; 276 / 20 / 39; unl. 73 | 472; 276 / 20 / 39; unl. 73 |
| | page (settled) | 273 / 20 / 42 | 276 / 20 / 39 | 276 / 20 / 39 |
| **test (held out)**, 405 / 272 | RapidOCR | 359; 187 / 12 / 73; unl. 40 | 359; 187 / 12 / 73 | 359; **188 / 11** / 73; unl. 40 |
| | tesseract four | 294; 155 / 27 / 90 | | 294; 156 / 27 / 89 |
| | five, lead (CLI) | 360; 207 / 16 / 49; unl. 53 | 360; 208 / 16 / 48 | 360; **209 / 15** / 48; unl. 53 |
| | page (settled) | 205 / 16 / 51; unl. 52 | 206 / 16 / 50 | **208 / 14** / 50; unl. 52 |
| CORD text, train / val / test | | 767 / 97 / 94; tax 325 / 46 / 41 | same | same |
| SROIE 626 (boxes) | | total 609/625, date 601/611 | same | same |

Read plainly:

- #17047's four rules move 3 taxes of 335 on the shard they came from and 1 of 272 on the
  held-out test (CLI and page). That is the 3 to 4 its note expected on the shard. They
  added no total.
- The table rule adds 1 more held-out tax with the CLI and 2 on the page, each a wrong
  amount turned right. On shard 1 its two changes are taxes WildReceipt does not label, so
  the score cannot see them. They were checked by eye.
- From before to now, the held-out CLI reads 207 → 209 taxes of 272, and the page 205 → 208.
  No right answer turned wrong in any mode, and no total moved.

## Integrity notes

- The rule was written from two shard-1 receipts, both read in this session, before the
  held-out test was scored. The test was then scored once with each of the three versions:
  aggregates only. No test receipt was printed or read, and no per-receipt diff was run on
  the test.
- This is the third run to score the WildReceipt test set. It stays a check, not a
  development set, but its gains are small enough that a fresh labelled source is what
  would say more now.
- No WildReceipt text or photo is in the repository, only the label amounts already in
  `wildreceipt/*.jsonl`. The two table shapes in the test file are written in the photos'
  style, not copied from them.

## Reproduce

As in [`wildreceipt-train1-2026-11-17.md`](wildreceipt-train1-2026-11-17.md), "Reproduce",
for `train-00001-of-00002` and `test-00000-of-00001`. To score an older version, copy the
venture directory and replace `receipts.mjs` with `git show <commit>:ventures/ai-bookkeeper/receipts.mjs`.
Then:

```
node eval/receipt-version-diff.mjs eval/wildreceipt/train1.jsonl r_w1 /abs/old-copy $PWD
```

## Next

- `VAT5%: 668` (decimal point lost on a slip with no commas) is still open from the last note.
- A fresh labelled source, not more rules from spent sets.
