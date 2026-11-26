---
kind: brief
date: 2026-11-26
subjects: [reseller-books]
title: Seller Books legal pages shipped, and the code facts the privacy policy rests on
description: Handover for private PR 203 (bet #5 paid-launch step 1), listing what to re-check when the code changes.
---

# Seller Books: legal pages shipped (private PR 203, bet #5)

Date: 2026-11-26. Explore run.

**What landed.** `private-monorepo` PR 203 adds Terms, Privacy, Refund and
Acceptable Use pages to `apps/seller-books`. This was step 1 of
`docs/BILLING.md` "Turning it on", needed for Paddle's domain review. It
follows the jobshop-quote/payapps/cmmc pattern: `docs/legal/*.md` bundled
by `sync-documents.mjs`, public `/api/legal` and `/legal/:key`, a
`legal_acceptance` table (migration 0002), and a "Before you continue" gate on the
shop list and org shell until the user accepts `POLICY_VERSION`.

**Facts the Privacy Policy rests on (checked against the code 2026-11-26).**
Re-check them whenever these change, and bump `POLICY_VERSION`:

- No LLM port (`src/worker/ports` holds only `billing.ts`), so the policy says
  "No AI model reads your books". Adding one means naming the provider.
- `import_batch` keeps `file_name` + `sha256`, never the file. No R2 binding.
- No buyer column. Depop's buyer username only feeds `rowKey`, an FNV hash
  used for de-duplication.
- No email provider, so the policy says the app sends no email.
- The mileage rate is a query parameter on the worksheet and is not stored.
- Mileage and expenses can be deleted but not edited. Inventory can be edited.
  `DELETE /api/orgs/:id` (owner, confirmName) deletes the shop, but the
  client has no button for it yet.

`src/worker/services/legal/documents.test.ts` pins the wording for these.

**Left for the owner.** The operator name, a contact email (each document
ends with a placeholder) and counsel review. Next for the bet: BILLING.md
step 2, the `seller-books-deploy` workflow with the Paddle catalog sync.

**CI.** Private CI was starved (run 45730784854, runner_id 0).
`run_workflow_locally.py --repo-root /home/user/private-monorepo
seller-books-ci` passed 7/7 run: steps.
