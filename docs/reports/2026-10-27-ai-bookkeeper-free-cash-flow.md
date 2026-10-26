# ai-bookkeeper: free cash flow (2026-10-27)

`cashFlow()` in `ventures/ai-bookkeeper/ledger.mjs` returns `capex` (sum of negative investing items) and `freeCashFlow` (= operating - capex). Shown in index.html and `cli.mjs report`. Test: engine.test.mjs, depreciation test. Not checked on real books; flagship `next:` list is unchanged (real inputs remain the open work).
