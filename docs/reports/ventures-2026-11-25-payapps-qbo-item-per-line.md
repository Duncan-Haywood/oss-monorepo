---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): a QuickBooks item per schedule-of-values line

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#120 (merged).

**What landed.** The roadmap item "QuickBooks, an item per schedule-of-values line". PR 113 there
let a whole job use its own QuickBooks item. Now any single line of a job can too:

- **QuickBooks page.** Each job row has a **Lines** button. It opens the job's schedule-of-values
  lines, each set to "The job's item (…)", and an admin can pick another item for any line. The
  job row shows how many lines have their own item.
- **Sending.** The invoice still has one line per schedule-of-values line, billing exactly what
  the application adds to column G. Each line now posts to its own item if it has one, otherwise to
  the job's item, then the company's, then the default. The retainage line is unchanged, so the
  invoice total is still line 8.
- **Preview.** On the pay application, a work line whose item differs from the job's names the
  item it will use.

**Why a buyer cares.** An electrical sub's switchgear package, its labor and a design-assist fee
can belong in different income accounts (equipment sales, contract labor, professional fees).
Before this change, one invoice could post to only one item, so the bookkeeper re-split every
invoice by hand in QuickBooks. QuickBooks sync is a day-one need in bet #1's evidence, and this
removes a monthly manual step.

**Choices to keep.**

- The order is line, then job, then company, then default. Each choice is tied to the QuickBooks
  company it was made in (`qbo_item_realm_id`), so connecting a different company ignores it, the
  same way the job's item works.
- Each line item an invoice uses is read again before sending. If one has been made inactive, the
  send stops with a 409 that names the line, the job and the item, and nothing is created. It does
  not fall back to the job's item, which would post that income somewhere the bookkeeper didn't
  choose. An application that bills nothing on that line still sends.
- If every work line has its own item, the job's and company's items aren't read or created, so
  a company item made inactive doesn't block that invoice.
- Same checks as the other item pickers (active Service or Non-inventory, posting to an income
  account, not the Retainage item). The sample job is refused, and a line of another job or company
  returns 404.
- `sov_lines.qbo_item_id/_name/_realm_id`, migration 0033 (made with drizzle-kit, no drift).

**Verification.** The private CI has no runner, so the `payapps-ci.yml` steps were run locally:
biome ci clean (one existing warning in `billing.ts`), typecheck, the unit and worker suites,
build, provision 4/4, no migration drift; unit 411/411 and worker 257/257 (unit 419/419 again after
merging main's PR 119). A new worker test
(7 cases) covers the per-line send, the preview's item names, an inactive line item stopping only
invoices that bill that line, every line on its own item, admin-only access, cross-job and
cross-tenant 404s, and the realm switch. A new unit test (3 cases) covers the picker. Not checked
against a real QuickBooks sandbox (no Intuit app yet; that is an owner step in the roadmap).

**Next on this thread.** Class or location tracking per job (QuickBooks Plus) once a customer asks
for it. The launch blockers in the roadmap ("Must do before a public launch") are owner steps.
