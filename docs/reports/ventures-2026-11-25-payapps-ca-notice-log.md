---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): California preliminary notice, part 2 (notices given, § 8118 proof, 20-day reminder)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#179 (merged).
Claim: `claim/payapps/ca-preliminary-notice-part-2`. Follows private PR 177 (part 1, the notice
itself).

**What landed.**
- `packages/lien-waivers/src/ca-proof.ts`: pure rules quoting Cal. Civ. Code § 8204(a) (due 20
  calendar days after first furnishing; a late notice covers work from 20 days before service),
  § 8116 (complete on delivery or deposit; five days after mailing for CCP § 415.20) and the § 8118
  proof of notice declaration (the three (a) items as headings, the (b) documents word for word by
  method). `test/ca-proof.test.ts` checks the rules and copied text against the existing snapshot
  `sources/ca-8102-8216.txt`.
- App: `projects.ca_first_furnished_on` and table `lien_notice_sends` (migration 0036). Routes under
  `/projects/:id/notices/ca/` (PUT first-furnished, POST/DELETE sends for editors, GET
  `sends/:id/proof.pdf` for anyone in the org; Crew plan). The job page's notice panel gains
  "Notices given (California)".
- Reminder: `caNoticeText` in `src/shared/cash-report.ts` adds a cash-report action, so it reaches
  the cash page and the weekly digest email with no new email code. It waits on the owner and the
  direct contractor only (the lender is owed one "if any", which PayApps cannot know) and stops when
  the date is cleared.
- Marketing site feature bullet; the customer post on statutory lien waiver forms has a new section.

**Not done, and why.** The declaration does not print the "under penalty of perjury" sentence:
Code Civ. Proc. § 2015.5 is not in the snapshot, and this run's proxy refused
`downloads.leginfo.legislature.ca.gov` (403), so the range-read recipe from part 1 could not run.
The UI and the PDF disclaimer say to add it. The next run that reaches the bulk download should add
CCP 2015.5 to the snapshot (`LAW_SECTION_TBL.dat`, law code CCP) and print it. Also open: records in
the job history, attaching the scanned receipt.

**Verification (local; private CI jobs ended in 3-8 s with no log, so no runner).** lien-waivers 220/220, payapps unit 500/500, worker 280/280, build ok, payapps-site unit 21/21, typecheck and biome clean. Proof PDF rendered with poppler (one page). PDFs now print "§" as "Sec." everywhere (`toPdfText`); before this they printed "?".
