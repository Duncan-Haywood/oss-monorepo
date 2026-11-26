---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: the network diagram on the asset inventory (2026-11-26)

Bet #4. Private-monorepo PR #304, merged (squash `3c92aed`). Claim: `claim/cmmc/asset-inventory-network-diagram`
(a `--slug` part of Next item 4; `esp-part-3-crm-import` was claimed on the same item minutes earlier and
landed as #303, which conflicted only in README/ROADMAP prose).

## Why this
The security queue and ideas inbox were empty. payapps' free items were gated ("if customers bill through them").
einvoice "Hosting, part 2" was claimed by another run 5 minutes before me: `roadmap_claim.py` said TAKEN, and
`git ls-remote` showed someone else's claim, not mine. Of cmmc's item 4 parts, the network-diagram slot was the
only one that needs no outside file.

## Source
`https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-32.xml?part=170&section=170.19` answered 200
through the proxy **only with `--compressed`** (without it: 406, "requires response compression"). The file's
sha256 is the same `69465e2b...f197` the app already pins. Table 3 gives the CUI, SPA, CRMA and Specialized rows
the verbatim line "Document in the network diagram of the CMMC Assessment Scope." (`NETWORK_DIAGRAM_QUOTE`).

## What landed (`apps/cmmc`)
- Migration `0011_network_diagram.sql`: `org_profile.network_diagram_evidence_id` (nullable).
- `services/assets`: `networkDiagram` (joins on `evidence.org_id` too), `setNetworkDiagram` (refuses another
  org's file or a missing id; audited `asset_inventory.diagram_link` and `diagram_unlink`), and
  `unlinkNetworkDiagram`, called from `deleteEvidence`.
- `PUT /assets/network-diagram {evidenceId|null}`: editor role; linking needs Level 2, unlinking does not.
- `checkInventory(items, { hasNetworkDiagram })`: one issue when an in-scope asset is listed and no diagram is linked.
- SSP: a line under "### Asset inventory" naming the file (title, file name, sha256 prefix), or "Not yet linked"
  with the quote. Nothing is printed when only out-of-scope assets are listed.
- SPA: `NetworkDiagram.tsx` card on the Assets tab (pick from evidence, or upload with the no-CUI box).
- Privacy policy: the inventory clause now names the link. No POLICY_VERSION bump, because there is no new data
  category (same reasoning as ESP part 2). cmmc-site gets one line on the features list.

## Verification
`run_workflow_locally.py --repo-root /home/user/private-monorepo cmmc-ci`: 8/8 run steps pass, both before and
after merging main (#303). That covers Biome, typecheck, unit, workerd tests, deploy provisioning, build, and
migrations in sync. Private CI was starved (runner_id 0). The UI was not clicked through in a browser; cmmc still
has no e2e suite.

## For the next run
- Item 4 still open: the worksheet's saved JSON (needs `classify` ported), and uploading straight from the
  Providers form. The Assets card's upload-then-link pattern (`NetworkDiagram.tsx`) is the template for the second one.
- A cmmc e2e suite (Playwright, like jobshop-quote's `test/e2e/`) is the cheapest way to cover the SPA these
  parts keep adding.
