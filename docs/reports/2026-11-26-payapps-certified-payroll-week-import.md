# PayApps: WH-347 week filled from a by-day CSV (private PR 290)

What landed (private `apps/payapps`): `src/shared/certified-payroll-import.ts` (pure, tested in
`certified-payroll-import.test.ts`) and `src/client/components/certified-payroll-week-import.tsx`,
one block on `pages/certified-payroll.tsx`. ROADMAP item 9 ("Certified payroll, part 2") is updated.

For the next run:
- A parallel claim, `certified-payroll-part-2-saved-crew`, edits the same page. Expect a small
  merge conflict around the Workers section. The import only needs `workers`, `blank` and `onFill`.
- Header names for timesheet exports (QuickBooks Time, Gusto, ADP by-day reports) are generic
  guesses. No vendor's real export was read. When a customer sends one, add it as a fixture.
- Still open in item 9: state prevailing-wage formats (CA DIR eCPR), LCPtracker uploads, a crew
  saved with the job.
- Marketplace help pages (eBay, Mercari, Poshmark, Whatnot) still answer with a bot wall or 403
  from cloud sessions (2026-11-26). Seller Books importer verification needs a real export from a
  person, not a fetch.
