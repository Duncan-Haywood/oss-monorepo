---
kind: note
topics: [redteam]
date: 2026-11-25
---
# Red team 2026-11-25: the Paddle licence path (platform/billing)

The shared Buy-button and licence-key code every paid pack ships
(`platform/billing/client.mjs`, copied byte for byte into seven ventures as
`paddle.mjs` by `sync.mjs`) and its billing Worker (`server.mjs`).

- **Campaign:** 8 mutants in `ventures/wall-framing-takeoff/paddle.mjs`
  (bet: framing takeoff, a subscription pack). The venture's own suite (26 s)
  caught 1/8. Run by hand against `client.mjs` with `billing.test.mjs`
  (sync test skipped), the shared suite caught 4/8.
- **Worst escapee:** `verifyLicence` returning `valid: true` when the public
  key is missing or malformed. Both `billing.test.mjs` and the testkit
  asserted only the `reason` string. Also escaped: the claim URL (fake fetch
  ignored it), the wait between polls, a two-letter product slug.
- **Guards added:** a `billing.test.mjs` test that kills the four behaviour
  escapees on `client.mjs` (8/8 by hand); `testkit.mjs`'s
  `assertPackLicence` now asserts each venture's `paddle.mjs` equals
  `client.mjs`, so all seven ventures' suites catch any edit to their copy
  (rerun: 8/8).
- **Real defect (patched):** `billing.test.mjs` (webhook signature, licence
  signing, the D1 schema, the copy-sync check) runs only from
  `unwired_checks.py` inside `ventures-tests.yml`, and that workflow's path
  filter did not include `platform/billing/**`. A PR touching only
  `server.mjs` or `client.mjs` ran none of it. Same for 61 other suites in
  16 folders (platform/proposal, platform/devlog, platform/distribution,
  platform/aws, portfolio/ledger, portfolio/router, ...). Fixed by adding
  `platform/**` and `portfolio/**` to the filter; `unwired_checks.py`
  gained `untriggered_suites()` and `test_unwired_checks.py` (`Triggers`)
  fails if a suite the step runs is ever outside the filter again. The full
  unwired set ran green here (294/296, 2 npm skips), so the wider trigger
  starts green.
- **Read, no defect found:** `server.mjs` (signature tolerance, product from
  price not `custom_data`, idempotent claim store, renewals only to a later
  expiry) and `catalogue.mjs`.
- **Open list:** the three entries (`framerate` nightly, IDS conformance
  fetch, help-keeper stemming) still need a control-plane PR or an eval set;
  unchanged.
