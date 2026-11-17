# Synthetic benchmark, 2026-11-17

Generated data, not real statements. Command: `node eval/synthetic.mjs` (seeds 1-5, 40 customers, 400 receipt attempts per seed; a receipt is dropped when its customer has no open invoice left).

```
Synthetic benchmark, seeds 1-5, 1606 receipts (generated data, not real statements)

By confidence tier: receipts, exactly right invoice set
  high     1146  99.8%
  medium    185  97.3%
  review    255  63.5%
  none       20  0.0%

By scenario: receipts, proposed, exactly right
  bank fee          92  100.0%   84.8%
  discount         176  100.0%   97.2%
  name multi       165   98.2%   79.4%
  name single      321  100.0%   86.0%
  ref multi        232  100.0%  100.0%
  ref single       486  100.0%  100.0%
  short-pay         66  100.0%  100.0%
  unknown payer     68   75.0%   67.6%
```

"Exactly right" means the proposed invoice set equals the generated truth. The High and Medium misses (2 and 5) are all swaps between same-customer invoices of equal amount, where an earlier receipt had already taken the twin; the money applied is the same, the invoice number differs. Review rows are mostly FIFO picks among retainer invoices of equal amount and amount-only cheques, which is why they are marked for review.
