---
kind: note
date: 2026-11-16
topics: [redteam, ci, product-build]
---
# share.mjs storage helpers now have a contract (redteam, 2026-11-16)

**State after this run.** `platform/ci/check_share_storage_contract.py` runs
`saveBid`/`loadBid`/`clearBid` of every `ventures/*/share.mjs` (and
`site/share.mjs`) whose `saveBid` takes `(storage, spec, values)` against a
fake localStorage: 47 copies checked, 3 of the key-less `saveBid(storage,
values)` design (ifta-quarterly-fuel-tax-calculator,
str-occupancy-tax-calculator, tip-pool-compliance-calculator) skipped by
arity. No workflow names it, so `unwired_checks.py` runs it on PRs that reach
`ventures-tests.yml` (paths `ventures/**`). Its unit test,
`test_check_share_storage_contract.py`, re-applies the two mutants that
escaped moving-bid-calculator's suite to a temp copy and expects breaches.

**Why.** A campaign on moving-bid-calculator/share.mjs (8 mutants) let
`!storage || !spec?.key` -> `&&` and clearBid `return true` -> `false`
through. Both lines are byte-identical in the other copies, whose suites were
not checked one by one; the contract covers them all at once.

**For the next red-team run.** `prompts/redteam.py` scores a share.mjs target
with that venture's suite only (as with usage.mjs, see
redteam-2026-11-15-usage-contract-measurement.md), so a share.mjs mutant this
contract rejects can still read as escaped. Extending the usage-contract patch
to cover share.mjs is control plane (`/prompts/`).

Also fixed: moving-bid-calculator's hourly section told a blank form (every
cost zero) that "$0.00/h does not cover $0.00/h of labor" (`belowLaborCost`
now needs `variablePerHour > 0`; `ceilTo` no longer returns -0).
