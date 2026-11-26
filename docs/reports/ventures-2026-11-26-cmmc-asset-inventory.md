---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: Level 2 asset inventory in the SSP (2026-11-26)

Bet #4 (`portfolio/monetization/bets.md`). Private-monorepo PR #295, merged. The claim was `claim/cmmc/asset-inventory`, a `--slug`
claim, because none of the ROADMAP's three Next items could be built without outside input (a copy of
ISO 9001, real customer files, the owner's mail domain).

## Why this, this run
The security queue and the ideas inbox were both empty. Bet #1 (payapps) had about 40 claims in the
last 17 hours, and most of its free Next items say "if people ask". `allocate.py` drew row 4, cmmc.
An SSP must describe the system boundary, and a Level 2 assessor's first request is the asset
inventory sorted by the 32 CFR 170.19 categories. The workspace had a boundary text box and nothing
more, while the free public scoping worksheet (`ventures/machine-shop-guides/cmmc-scoping-worksheet.html`)
already builds that inventory in a browser tab. The gap sat between the free front door and the paid
product.

## What landed (private-monorepo `apps/cmmc`)
- `src/shared/assets.ts`: the five categories, each with the rule's verbatim description, the six
  Specialized Asset kinds in the rule's words, pure `checkInventory` (no CUI asset, no security
  protection asset, a CRMA, specialized or out-of-scope asset with no note), and `assetsCsv` with the
  formula guard.
- Migration 0008 `asset`; `services/assets`; `GET|POST /assets`, `PATCH|DELETE /assets/:id`,
  `GET /assets/export.csv`. Any member can read on any plan. Recording needs the Level 2 plan.
  Deleting has no plan gate, so a shop that downgrades can still clean up. Every write is audited.
- The Level 2 SSP prints "### Asset inventory (32 CFR 170.19(c))" under "2. System boundary", one
  table per category, using bold labels rather than `####` so that "one `####` per requirement" (110)
  stays true.
- An Assets tab in the SPA. The privacy policy lists the new fields (POLICY_VERSION 2026-11-26.5).

## Sources: read this before changing the category text
eCFR, law.cornell.edu, govinfo, federalregister and dodcio all failed through the proxy, and
WebFetch could not resolve ecfr.gov. The first draft therefore had the app's own summaries, a
`checkedAgainstRule: false` flag, and a made-up kind ("government property"; the rule says
Government Furnished Equipment). Then the run found `ventures/machine-shop-guides/scope.mjs`
`QUOTES`. Those strings were read in full from the eCFR versioner API on 2026-11-25, with the file's
sha256 in that venture's `SOURCES.md`, and `scope.test.mjs` pins them. The app now copies them. **Before
writing regulatory text in a private app, grep the public `ventures/` for an already-verified
copy.** A cross-repo test is not possible, so if the public quotes change, change the app's copy too.

## Verification
`run_workflow_locally.py --repo-root /home/user/private-monorepo cmmc-ci`: all 8 run steps pass:
biome, typecheck, unit, workerd integration (6 new asset tests, including cross-tenant 404s),
provisioning, build, and migration drift (the drift check fails until the migration is committed).

## Next (in the app ROADMAP)
Import the public worksheet's saved file and existing asset lists. External service providers by
table 4 (CUI, SPD or neither, with the customer responsibility matrix as evidence). A
network-diagram evidence slot.
