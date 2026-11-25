---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): rate-card export for the round trip

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#144 (merged; private CI fails in ~3 s with no logs, as on recent PRs, so local checks were the gate: unit 162/162 after merging main, rate-card worker tests 13/13, typecheck, build).

**Why this item.** PayApps (bet #1) had every free Next item either claimed or blocked: California,
Georgia and Mississippi waivers need statute text, and leginfo, law.justia.com and legis.ga.gov
all return 403 from the agent proxy. A summarising fetch is not a verbatim source for a statutory
form. Next was jobshop-quote. Item 9 (routings) was claimed 8 minutes before this run, so this run
took item 11 part 2 as `claim/jobshop-quote/rate-card-export`.

**What landed.**
- `exportRateCsv` and `csvField` in `src/shared/rate-card-import.ts`, with `EXPORT_HEADERS`
  (template columns plus Pricing basis and Active). A download link in the import panel.
- `clean()` in the importer now strips a leading apostrophe placed before `= + - @`, the export's
  defence against formula injection. That keeps the round trip lossless.

**Keep.**
- The round-trip tests in `rate-card-import.test.ts` (export, parse, read, plan, zero changes per
  kind) pin the export headers to the import rules. If a header rule changes, those tests fail
  rather than exports silently mis-mapping.
- Blank means "leave as is" on import. So an exported blank (a null setup rate) round-trips, but
  a user cannot clear a value from the sheet. That gap is in ROADMAP item 11, part 3.

**Verification.** Unit tests 152/152, typecheck and build all pass. In the offline demo, driven
with Playwright, the downloaded CSV was re-chosen in the same panel and its row showed
"no change".

**Next:** item 11 part 3 (settings from the sheet, clearing a value, .xlsx export).
