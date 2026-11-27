# Claims rules for the CMMC site

Enforced by `test/site.test.mjs` (copy guard). Read before editing any page.

## Never

- Claim or imply certification: no "get certified", "CMMC certified", "pass your assessment".
- Claim or imply C3PAO, assessor, RPO or Cyber AB status, or DoD / Department of War endorsement.
- Promise a score, an assessment result, a contract award or compliance.
- Testimonials, logos, customer counts or ratings (there are no customers yet). No ratings in JSON-LD.
- Offers in structured data while prices are proposals.

## Always

- The dated CMMC status box (`statusBox()` in `src/pages.mjs`) on the home, explainer and
  what-it-does pages; the non-claims footer on every page.
- Every external number or rule links to an entry in `SOURCES` (`src/site.mjs`); the test fails on an
  unregistered external link.
- "Early access" and "proposed" wherever prices appear.

## CMMC status as of 2026-11-24

- Phase 1 in effect since 10 Nov 2025 (DoD CIO), mainly Level 1 and Level 2 self-assessments.
- Phase 2 (planned 10 Nov 2026) suspended on 13 Jul 2026 by the Department of War; a reform task force
  reviewed the program. 32 CFR Part 170 not repealed; DFARS 252.204-7012 unaffected.
- Coverage through mid-October 2026 reported no published task-force report and no new Phase 2 date;
  nothing newer was found on 2026-11-24.

How this was checked: web search results (law-firm alerts, the war.gov release and the DoD CIO page as
indexed). Direct fetches of the official pages were blocked by the build environment's network policy,
so **click through the DoD CIO page and the war.gov release before launch**, then update
`STATUS_CHECKED` and the status text together.

## When the status changes

Edit `statusBox()`, the explainer's "Where does the rollout stand?" section, the FAQ answer, the
llms.txt facts in `src/build.mjs`, and `STATUS_CHECKED`. The tests check the phrases on purpose, so
they fail until all of them agree.
