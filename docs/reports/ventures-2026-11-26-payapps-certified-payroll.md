---
kind: milestone
date: 2026-11-26
---
# PayApps: Davis-Bacon weekly certified payroll (WH-347 layout), part 1

Date: 2026-11-26. Bet #1 (pay-app billing, `private-monorepo/apps/payapps`), private PR 287,
claimed as `claim/payapps/certified-payroll-wh347` (a new item, not on the ROADMAP's Next list:
every free Next item was marked "if people ask", and certified payroll is weekly paperwork the
same subs owe on public jobs).

## What landed

- `src/shared/certified-payroll.ts` (pure, zod schema + compute): WH-347 Rev. January 2025
  columns. Hours in hundredths, money in cents. Computes 5, 6B (worker's page-2 hourly credit x
  row hours), 6C, deduction total, net; 7A blank = hours x rates + 6C; 7B blank = 7A. Errors and
  warnings listed in the ROADMAP "Done" entry. The six statements are stored verbatim.
- `services/export/certified-payroll-pdf.ts`: landscape letter, 8 rows a page, page 2 statement,
  addendum page past 8 credited workers or long remarks. Blank signature on purpose.
- `POST /api/orgs/:orgId/projects/:projectId/certified-payroll.pdf`: tenant check by
  `getProjectRow`, nothing stored. Every plan.
- `src/client/pages/certified-payroll.tsx`: the form; draft in localStorage
  (`payapps:certified-payroll:<org>:<project>`), "Start next week".
- Privacy Policy bullet + POLICY_VERSION 2026-11-26.13; header email truncates on phones.

## Sources

- Form: https://www.dol.gov/sites/dolgov/files/WHD/legacy/files/wh347.pdf (Rev. January 2025,
  OMB 1235-0008, expires 01/31/2028), fetched 2026-11-26; it is an AcroForm, so a later part could
  fill the official PDF instead of drawing our own layout.
- Instructions: https://www.dol.gov/agencies/whd/forms/wh347instr (column-by-column rules, the
  "boxes 1, 2, 3 and 6 always" rule, 8 entries per page numbering).
- The annotated guide PDF is images only (no text layer).

## For the next run

- Unsure, left to the contractor: whether 7A should include cash in lieu. DOL's instructions do not
  say; the build adds 6C to the computed 7A and lets the contractor type the payroll's own figure.
- Part 2 ideas (ROADMAP Next): fill hours from a by-day payroll report, save the crew with the job,
  California DIR eCPR and other state formats once their specs are read, GC compliance-system
  upload formats if GCs ask.

## Verification

Private CI has no runner (ci_starvation exit 0 on run 45783529239). Local: biome ci, typecheck,
payapps unit 818, worker 380 (after merging main), payapps-site unit 21, build; Chromium smoke on
`vite dev` (sign-up to PDF download, SSN block, next week, reload, 390 px).

## Part 2: hours by day from a time report (private PR 289)

Claimed as `claim/payapps/certified-payroll-part-2-saved-crew`, but built as the item's "fill the
week from a report" half, not the "save the crew" half. Saving the crew on the server would break
the page's privacy promise (workers' names and IDs not stored) and the ROADMAP marks it "if people
ask", so it stays open.

- `src/shared/certified-payroll-import.ts` (pure): header finder and column guesser (reuses
  `parseCsv`, `parsePayrollDate`, `parseHours` from `payroll-report.ts`), `timesheetHours` (per
  worker + classification + day, ST/OT), `fillFromTimesheet` (generic over the page's draft types;
  takes `blankWorker`/`blankRow` factories so React uids survive).
- Refusal rule: a date column whose header is a pay-period name (pay date, check date, period end,
  week ending) is an error, not a guess. A generic "Date" with all rows on one day only warns. If
  a report ever arrives with a per-day date under a period-sounding header, the person can pick
  another column; the refusal is by header name.
- OT: from an "overtime hours" column (subtracted from a *total* hours column, added to a
  *regular* one; decided by the hours header name), or the whole row when the pay type reads as
  overtime. Non-work pay types are skipped and named.
- `src/client/components/timesheet-import.tsx`, in the Workers section. No server call.
- Privacy Policy: one sentence (file read in browser, not sent); no POLICY_VERSION bump since no new
  data is collected.

Verification: private CI starved (ci_starvation exit 0, run 45786033853). Local: biome ci (one
pre-existing warning in `billing.ts`), typecheck payapps + payapps-site, payapps unit 93 files /
832 tests, payapps-site unit 21, build. No browser smoke this time (happy-dom component tests cover
fill, refusal and no fetch). Worker tests not rerun: no worker code changed.

Next: a QuickBooks Time connection instead of a CSV, state formats (California DIR eCPR), GC
compliance-system uploads; all "if people ask".
