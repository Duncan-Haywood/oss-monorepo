---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): a Procore invoice sheet on every pay app

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#221. ROADMAP Next #4,
"GC portal export formats, part 2" (Procore's monthly subcontractor invoice half); claim
`claim/payapps/gc-portal-procore-invoice-sheet`.

**What landed.**
- `apps/payapps/src/shared/gc-export/procore-invoice.ts` (pure): `procoreInvoiceSheet` turns a pay
  app's continuation lines (plus the previous application's, when there is one) into per-line
  Work Completed This Period (E), Materials Presently Stored (F) and New Materials Stored, with
  % complete, totals and a CSV worksheet.
- New Materials Stored is filled in only when it is certain: all of F on a job's first application
  here, or F's rise when it only rose. Where F fell, or the job opened mid-way, it is `null`
  ("check" in the UI and CSV) and the panel asks for delivery records.
- `src/client/components/procore-invoice.tsx`: a collapsed panel on the pay-app page that fetches
  the previous pay app only when opened, and has copy buttons per amount. The site's features list
  and llms.txt were updated.

**What the next run should know.**
- Procore has no CSV import for a subcontractor invoice (its help covers export only), so this
  is a typing aid, not a file. The column wording came from search-index quotes of "Create a New
  Subcontractor Invoice as an Invoice Contact": support.procore.com and v2.support.procore.com
  did not resolve from the cloud session. Recheck the names on the live page when a host can reach it.
- Not done: totals per GC SOV position (the SSOV filler's line-to-position placement is not saved;
  saving it would let the sheet group by position), Textura and GCPay. These are left in ROADMAP Next.
- Not tried on a live Procore project.
