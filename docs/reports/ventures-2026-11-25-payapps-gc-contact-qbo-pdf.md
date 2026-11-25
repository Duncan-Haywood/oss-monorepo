---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): GC billing contact on the QuickBooks invoice and the application PDF

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#83 (merged).

**What landed.** The roadmap item "GC billing contact, part 2". PR 80 there gave each job a GC
billing contact (accounts payable name and email) for the follow-up email drafts. That contact now
also reaches the two places where the GC actually receives the bill:

- **QuickBooks invoice.** The job's contact email is the invoice's own `BillEmail`, so "Send" in
  QuickBooks emails the invoice to the GC's accounts payable for that job. The invoice preview on
  the pay application page shows which address it will carry, or says how to add one.
- **Application PDF.** An "Attn: name, email" line under "To (general contractor)" on the summary
  page. It is printed only when the job has a contact.

**Why a buyer cares.** An invoice that lands in the wrong GC inbox waits until someone forwards
it. QuickBooks is the books these subs already use (bet #1's evidence), so once the contact is on
the invoice, its own Send button reaches the right person.

**Choices to keep.**

- The address goes on the invoice, not the QuickBooks customer. Jobs for the same GC share one
  customer, and `upsertCustomer` rewrites a customer's email when it differs. Setting it there
  would make each job's send overwrite the contact the last job set.
- The job form accepts up to 254 characters, but QuickBooks takes 100. An address QuickBooks would
  refuse is left off and the preview carries a note, so the whole send does not fail
  (`invoiceBillEmail` in `services/quickbooks.ts`). `packages/qbo-sync` checks again
  (`isSingleEmailAddress`: one address, no commas, semicolons, angle brackets or line breaks), so
  no other app using the package can add a second recipient.
- No schema change and no migration (drizzle-kit reports no drift).

**Verification.** The private CI has no runner, so the `payapps-ci.yml` and `qbo-sync-ci.yml` steps
were run locally: biome ci clean (one existing warning in `billing.ts`), typecheck clean, unit
273/273, worker 177/177, build, provision 4/4, no migration drift, and
qbo-sync 51/51 with typecheck. New tests cover the `BillEmail` body, refused addresses (sending
nothing), the preview note, the invoice's stored billing email and the PDF "Attn" line.

**Next on this thread.** The contact on the change order request PDF, then "Weekly email, part 2"
(a link from each past-due line to its own draft).
