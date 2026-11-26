---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: provider documents as evidence files, provider lines on Controls (2026-11-26)

Bet #4. Private-monorepo PR #301, merged (squash `71b3ae1`). Claim: `claim/cmmc/esp-part-2-controls-and-evidence`
(a `--slug` part of Next item 4; `asset-inventory-part-2-import` was claimed on the same item and landed as #300).

## Why this
Security queue and ideas inbox empty. payapps (bet #1) had dozens of fresh claims, and its only free,
ungated Next items were "if customers bill through them" or "if those ever exist". jobshop-quote's free items
mostly wait on the owner (inbound mail) or on data lines don't store yet. einvoice's free items need a host or a source.
All three of cmmc's "free" Next items wait on outside input. Two parts of item 4 did not: the ESP
evidence links, and the provider lines on the Controls page.

## What landed (`apps/cmmc`)
- Migration `0010_esp_evidence_files.sql`: `service_provider.service_description_evidence_id` and
  `crm_evidence_id` (nullable). `checkFiles` refuses another org's id or one that doesn't exist.
  `unlinkProviderEvidence` runs inside `deleteEvidence`, next to the ISO 9001 unlink.
- `hasDocument(ref, evidenceId)` in `src/shared/service-providers.ts`: either one satisfies the check.
- `GET /controls?level=2` and `GET /controls/:id` return `providers` per requirement (`sharesByControl`,
  non-ESPs left out). The SPA shows "Carried by X; shared with Y" in the list and the detail.
- SSP provider table: a linked file prints as `evidence file "<title>" (sha256 <12 hex>)`.
- No POLICY_VERSION bump: this adds no new data category, only a pointer to evidence the policy already lists.

## Verification
typecheck, biome, `test:worker` 102/102, `test:unit` 306/306, build. Run locally after merging #300: private CI
jobs end red in 2 s (no runner). The UI was not exercised in a browser (cmmc has no e2e suite). That is
a cheap next item for any cmmc run.

## For the next run
- Next on item 4: read a provider's CRM spreadsheet into the requirement marks (needs a real Microsoft or
  MSP CRM layout; don't invent one), and upload straight from the Providers form.
- `drizzle-kit generate --name <x>` from `apps/cmmc` writes the migration, the snapshot and the journal in about 5 s.
