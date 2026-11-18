---
kind: note
topics: [redteam]
date: 2026-11-18
tagged: auto
---
# Red team 2026-11-18: semicolon CSVs read with the decimal comma stripped

- Campaigns: `ventures/rev-rec/csv.mjs` (10 mutants, 0.3 s suite; 8 caught)
  and `ventures/wasserstein-distance/engine.mjs` (8 mutants, 9 s; 7 caught).
  The escapes: one equivalent (`?? -1` to `?? -2`, which is only ever compared
  with 0) and two gaps, now tested: oneCurrency when the winning currency is
  not listed first, and the 50-cell date sniff. Catch rate 15/17 to 17/17.
- Real defects, all patched (7): a parser that sniffs `;` as a delimiter, then
  strips commas with `[$€£,%\s]`, reads `19,99` as 1999. All seven now
  vendor `detectDecimalComma(rows, delim)` (copied from
  restaurant-delivery-commission-analyzer, so check_decimal_format.py and
  check_decimal_comma_contract.py test the copies). The engines
  (wasserstein-distance, gaussian-process-regression, hdbscan-clustering,
  isolation-forest) carry `decimalComma` on the parsed table into
  `numText`/`isNum`. The calc parsers (ad-incrementality-test-analyzer,
  clearance-markdown-planner, liquidation-pallet-bid-calculator) run
  `decimalCommaCell` over the cells when the detector says comma. A first cut
  used `delim === ";"` alone; check_decimal_format.py flagged it (tab-delimited
  European exports, semicolon files with dot decimals).
- Trap: test_csv_thousands_split.py flags any file with `.split(",")` plus
  `replace(/,/g`. In these engines the split is `listOf` (a typed column list),
  not rows, so keep the comma strip inside the character class.
- Guard: `platform/ci/check_decimal_comma.py` (+ test). It is run by
  `unwired_checks.py`, with no workflow edit. The marker it looks for is the
  string `decimalComma`; a new parser that handles the decimal mark another
  way should name it in a comment or use one of the two fixes above.
- Not fixed, deliberately: a headerless semicolon file (`1,5;0,25`) sniffs as
  comma-delimited and gives a visible error, not a wrong number.
  robust-pca's `toNumber` rejects `1,5` as text (also visible).
  ebay-promoted-listings-roi-analyzer and etsy-ads-roi-analyzer strip commas,
  but they are comma-only US-export parsers, so the lint does not flag them. A
  `€1,50` from a European eBay export would still read as 150 there; worth a
  look if those tools gain non-US users.
- Step 0: all 11 open defects are control-plane edits, each with an open PR
  waiting for owner approval (#14612, #15945, #15728, #12926/#14877, #14698,
  #15561 and others). None reproduce as fixed on main. This run left them as
  they are.
