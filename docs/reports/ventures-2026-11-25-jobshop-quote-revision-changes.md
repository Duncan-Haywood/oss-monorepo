---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): "what changed from Rev N" on every revision

2026-11-25, ventures run. Private PRs: Duncan-Haywood/private-monorepo#141 (the feature) and #143 (the PayApps retainage fix), both merged.

**Why this item.** PayApps (bet #1) had 13 live claims on its ROADMAP. In bet #2, item 7
(quote revisions) part 1 had landed, but its side-by-side view was free. Claimed with
`roadmap_claim.py jobshop-quote --claim 7 --slug quote-revisions-part-2-changes-view`.

**What landed.**
- `src/shared/quote-diff.ts`: a pure diff with 8 unit tests. It pairs lines by RFQ part, then by
  part number + compatible revision, then by part number alone. Price rows cover every quantity
  in either revision. Operations are matched by machine and label, then by machine in order; a
  machine swap shows as removed + added. Finishing is compared as a multiset. Extras are
  matched by label.
- `GET /quotes/:id/changes[?from=]` (`services/quotes/changes.ts`). Names come from the shop's
  rows (retired ones included), and each line's snapshot fills the gaps. `?from=` must be the
  same org (404) and the same quote number (400).
- `src/client/components/revision-changes.tsx`, shown on any quote with `supersedesQuoteId`.
  `setData` invalidates its query, so the card follows draft edits.

**Bug found and fixed, twice.** `quoteLinePatchSchema = quoteLineSchema.partial()`. Zod 4.6.7
applies a `.default()` even inside `.partial()`/`.optional()`, so a PATCH of `inputs` alone set
revision and description to null. The schema is now explicit (in #141).

The same sweep found a worse case in **PayApps (bet #1)**, fixed in private PR #143:
`updateProjectSchema = projectSchema.partial()` with `retainagePctBps: bps.default(1000)`. The
notary block toggle, pay terms, GC contact and close/reopen each PATCH the job with a partial
body, so each one reset both retainage rates to 10%. The next pay application would then bill at
the wrong retainage. The patch schema is now built from the fields without defaults, and
`test/worker/project-patch.test.ts` fails before the fix.

The other apps' `.partial()` schemas were checked: Grants' funder schemas have no defaults,
Grants' `FactValue` is always replaced whole, and seller-books' lot input and jobshop-quote's
rate card have no defaults. **Rule for new code:** never `.partial()` a schema that has
`.default(...)`; keep a defaults-free `fields` object and `.extend()` it with the defaults for
create.

**Next.** Part 3: the summary as an optional PDF line for the customer, a revision picker (the
API already takes `?from=`), and the day-before-expiry email to the estimator. ROADMAP item 13:
the line editor overflows at 390 px. This was already there and the new card fits.

**CI.** Private Actions jobs still fail in about 2 s with no logs (merged PR #137 shows the
same). Verified locally after merging `main`: typecheck, biome, 146 unit tests, a 91-test
worker suite, the build, and `pnpm demo` driven by Playwright at 1200 and 390 px.
