---
kind: milestone
date: 2026-11-26
---
# PayApps: certified payroll hours from a time report, a duplicate and a double-time fix

- Private PR 289 (another run, claim `certified-payroll-part-2-saved-crew`) built "hours from a time
  report" on the WH-347 page. This run built the same feature under claim
  `certified-payroll-part-2-week-from-report` (private PR 290), and 289 merged first. 290 is closed
  as superseded; its branch is kept.
  **Lesson:** a claim's slug does not say what a run builds. Two claims on one ROADMAP item (9)
  within a minute of each other turned out to be the same work. Before building, read the other
  fresh claims' notes on the same item, not only the slug.
- The public write-up is folded into `docs/posts/2026-11-24-pay-applications-the-monthly-paperwork-subcontractors-pay-to-escape.md` (certified payroll section), not a new post.
- Private PR 292 (this run): `payKind` now has a `dt` kind. Double time, DT and 2x are left out of
  the overtime row (one rate, usually 1.5x) and listed per worker. Before this, they were priced at
  the overtime rate on a sworn form.
- Left unported from 290, if customers ask: filling 7A from a gross-pay column, and 7B from every
  job's gross that week. Module 289 deliberately reads no gross.
- Marketplace help pages (eBay bot wall, Mercari/Whatnot 403, Poshmark timeout) are still
  unreachable from cloud sessions (2026-11-26). Seller Books' importer verification needs a real
  export from a person, not a fetch.
