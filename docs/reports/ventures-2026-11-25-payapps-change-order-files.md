---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): change order files and "Backup attached" on the request

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#86 (merged).

**What landed.** The roadmap item "Change orders, part 3: the request's backup attached". Each
change order now holds its own files: the backup a GC asks for before signing (supplier quotes,
T&M tickets, invoices), photos of the condition, and the signed change order once it comes back.
"Files" on the change order's row opens the same panel as a pay application's attachments. The
change order request PDF lists the files under "Backup attached" by name and kind, so the GC can
check that everything arrived. The signed copy is not on that list because it is the GC's reply,
not backup.

**Why a buyer cares.** On a sub's side, change orders are where the money is lost: a GC that
"never got the quote" doesn't sign, and the work can't be billed until it does. With the backup
kept on the change order and named on the request, "what did we send them" has an answer.

**Design choices to keep.**

- A separate table, `change_order_attachments` (migration 0023), not a nullable column on
  `pay_app_attachments`. Each row has one parent, and the cascade does the cleanup.
- Same type allow-list, 15 MB a file, nosniff `attachment` downloads, and a Content-Type taken
  from the extension. There are 20 files per change order. **One storage limit per plan**:
  `usedBytes` in `services/payapps/attachments.ts` now adds both tables together.
- Objects go under the job's prefix (`.../projects/{id}/change-orders/{coId}/`), so deleting a job
  clears them. Deleting a change order purges its own prefix.
- Each file added or removed writes a job history row (`change_order_file_added` / `_deleted`).
- Privacy draft updated to name change order files. `POLICY_VERSION` was not bumped because
  nothing has launched and the drafts await counsel anyway.

**Left out on purpose.** The roadmap said "Next: the GC billing contact on the change order
request PDF". I didn't add it: that contact is accounts payable, and a change order request goes
to the GC's project manager. The right field would be a separate PM contact per job, which is now
in the roadmap's "Next".

**Verification.** Done locally in the private clone: `pnpm typecheck`, biome, the unit suite
(new: backup list and PDF in `test/unit/change-order.test.ts`, the per-change-order cap in
`src/shared/attachments.test.ts`), the worker suite (new `test/worker/change-order-attachments.test.ts`
covers upload and download headers, refused types, the PDF list without the signed copy, the
shared storage count, history rows, cleanup on change order and job delete, viewer read-only and
cross-tenant 404s) and `pnpm build`, then the rest of `payapps-ci.yml` (`biome ci .`, `scripts/provision.test.mjs`,
lien-waivers package tests, drizzle drift check). Counts: unit 279, worker 194, provision 4,
lien-waivers 211, all passing. Private Actions gave the CI job no runner (`runner_id` 0,
finished in 2 s), so the local run is the verification.

**Next.** A single PDF packet of the request with its PDF and photo backup. It needs the same
PDF merge as the pay-app backup packet, and the hand-written PDF writer has no reader yet, so
that is the real work.
