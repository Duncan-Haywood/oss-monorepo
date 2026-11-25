---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): Wyoming's preliminary notice of right to lien

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#138. Claim:
`claim/payapps/wy-preliminary-notice` (ROADMAP Next #1, lien waivers; it closes the Wyoming
entry's "Not done").

**Why this item.** Every ROADMAP item that needs new statute text (California, Georgia,
Mississippi) was blocked. This session the proxy refused every legislature host, wyoleg.gov
included (CONNECT 403), and the same was true for Justia. A parallel run claimed "Attachments,
part 4" a minute before this one. But § 29-10-101(a), the preliminary notice, was already in the
package's snapshot `sources/wy-29-10-101.txt`, so the notice could be built without any fetch.

**What landed.**

- `packages/lien-waivers/src/notices.ts` adds `noticeForms`, `noticeById` and `renderNotice`. The
  "NOTICE TO OWNER" is copied verbatim from the snapshot. `test/notices.test.ts` checks every
  heading and sentence in order, and checks that the whole of subsection (a) is printed.
- The notice says "A form of lien waiver is attached", so the § 29-10-101(b) waiver is attached
  blank.
- PayApps: the job page has a "Preliminary notice of right to lien" panel (Crew and up). It is
  prefilled from the job and the company name. `POST /projects/:id/notices/notice.pdf` returns the
  PDF. Nothing is saved, and there is no migration.
- Fix: `wrapText` printed "?" for line breaks in multiline values, on every PDF.

**Choices to keep.** PayApps states no deadline. The deadline is in § 29-2-112, which is not in the
snapshot. The notes quote the form's own words, "within the time periods specified in W.S.
29-2-112". An earlier ROADMAP line said "within 30 days of first work"; that line was removed
because nothing in the repository backs it. Fetch § 29-2-112 before encoding a deadline.

**Verification (run locally; private CI has no runner).** Package tests: 205/205. Unit tests:
491/491. Worker tests: 269/269, including a new notices suite covering the plan gate, the prefill,
the PDF content, field errors and a cross-org 404. Typecheck, build and biome are clean. The PDF
was rendered with poppler: page 1 is the notice and page 2 the blank waiver ending in the notary
block.

**Next.** A sent-on date per job, the § 29-2-112 deadline once it is fetched, and California's
20-day preliminary notice when leginfo can be reached. Each new state needs only a
`NoticeForm` in `notices.ts`; the panel lists states from the package.
