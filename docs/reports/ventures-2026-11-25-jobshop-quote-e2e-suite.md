---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): Playwright e2e suite (ROADMAP item 12, part 1)

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#182, claimed as
`claim/jobshop-quote/e2e-playwright`. Private CI jobs failed in 3–15 s with no logs (404), the
same "no runner" condition earlier runs saw today, so local checks were the gate.

**Why this item.** PayApps (bet #1) has a dozen live claims. Its free Next items either wait on a
customer asking or need proprietary GC-portal formats (Textura, GCPay) that no public source
documents. In jobshop-quote, item 12 was free, and it is the only browser-level check of the
whole product before launch.

**What landed (private).**
- `pnpm test:e2e` runs `scripts/e2e-run.sh`, which starts `scripts/e2e-server.sh` on :5198 with a
  fresh `.wrangler/e2e` built from the committed migrations, so it runs beside `pnpm demo` on
  :5199. `test/e2e/vite.e2e.config.ts` mirrors `vite.demo.config.ts` with file watching off.
  `@playwright/test@1.63.0` is the version grants already pins.
- `01-rfq-to-quote`: the UI flow from sign-up to Won. The price table is compared cell by cell
  with figures worked by hand in the spec.
- `02-tenant-isolation`: 403/404 across shops on every read and write, and 401 signed out.
- `03-phone-width`: the old `scripts/phone-width.mjs` turned into a test.
- A new `e2e` job in `jobshop-quote-ci`. It is blocking, unlike grants' demo-flow job.

**Keep.**
- `helpers.ts` `field(scope, label)` matches a `<Field>`'s label span exactly. `getByLabel` is
  ambiguous here: a field's accessible name includes its hint, and "$/lb" also appears in the
  "Priced" select's option text.
- `POST /rfqs` does not extract; the UI calls `/rfqs/:id/extract` right after. API seeding has to
  make the same call, or quoting returns 409 "Review and confirm at least one part".
- `/rate-card/import` and `/account` are not routes. The import is a panel inside the rate card.
  The old script's list had both, so it measured 404 pages and printed "ok".
- Seeded fault check: replacing `(1 + pct(material.scrapBps))` with `1` in `costing.ts` makes
  `01` fail on the price table.

**Verification.** e2e 3/3 (26 s, twice), typecheck, `biome ci`, and the unit, worker, build,
provision and drizzle checks from the CI `check` job, all run locally (results in the run record).

**Next (ROADMAP item 12, part 2).** An RFQ with a drawing PDF and a STEP file attached, the quote
email through the fake mailer, a revision and its changes view, an invited estimator's role
limits, and the rate-card spreadsheet import.
