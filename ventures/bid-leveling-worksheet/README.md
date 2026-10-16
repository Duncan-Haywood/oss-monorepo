# Bid Leveling Worksheet

A free browser tool (and small Node CLI) for general contractors, owners' reps and
procurement teams: **paste a subcontractor bid comparison, price the excluded and
unaddressed scope at your own estimate, and see whether the low bid is still the low
bid.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bid-leveling-worksheet/

After using this, you can now **compare bids on the same scope and catch the cheap bid
that left out controls, permits or rigging**, which used to mean an afternoon of
spreadsheet formulas per trade.

## Use

1. Build a table: header `item, estimate, Bidder A, Bidder B…`; a `BASE` row of lump-sum
   prices; one row per scope item with `incl`, `excl`, `?` (not addressed) or a dollar amount.
2. Open `index.html` and paste it (copy straight from Excel or Sheets).
3. CLI: `node cli.mjs bids.csv [--unknown 0.5] [--json]` (exit 1 when leveling changes
   which bidder is lowest).

## Rules

- Leveled total = base + adds. Included adds nothing; excluded adds your estimate;
  a bidder's own price replaces your estimate; not addressed adds estimate x weight (default 100%).
- Outlier flag: base under the median by N% (default 15) with 3+ bidders.

Not modelled: validity dates, alternates, unit prices, schedule, bonding, insurance,
qualifications. It does not say who to hire. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private dependencies.
