---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): the Procore invoice sheet totals by the GC's SOV positions

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#224. ROADMAP Next #4,
"GC portal export formats", part 2b; claim `claim/payapps/procore-invoice-by-position`. Follows
part 2a (private PR 221, `ventures-2026-11-26-payapps-procore-invoice-sheet.md`), which left this
open.

**What landed.**
- The Procore subcontractor SOV filler on the job page saves its placement with the job: the GC's
  positions (number, description, amount) and which base-contract line sits under which.
  `projects.procore_ssov` (JSON text, migration 0039), `PUT/DELETE
  /api/orgs/:orgId/projects/:id/procore-ssov`, editor-only, validated against the job's own base lines
  and the positions sent (`placementProblems`), recorded in the job history as "Procore SOV positions
  for the invoice sheet". Re-loading the GC's template preselects the saved choices over the
  amount/word guesses.
- `src/shared/gc-export/procore-placement.ts` (pure): `invoiceByPosition` totals the per-line sheet
  per position (E, F, new stored, % complete over the placed lines' scheduled values), keeps every
  position, lists change-order lines apart, names unplaced lines and flags GC-amount mismatches; a
  CSV of the same. `ProcoreInvoiceRow` gained `completedAndStoredCents`.
- The pay-app panel defaults to the by-position view when a placement is saved, with one click back
  to lines. Marketing feature bullets and llms.txt updated in `apps/payapps-site`.

**Verification.** biome, typecheck, unit (624), worker (297), build and the site's unit tests (21),
all green in the session; the repo's Actions runners are starved, as on every private PR.

**What the next run should know.**
- Assumption to confirm with the first customer on Procore: commitment change orders show on the
  GC's invoice as their own lines (Procore keeps them apart from the SOV positions), so they are
  listed one by one rather than placed.
- Still not tried on a live Procore project. Textura and GCPay remain in ROADMAP Next.
