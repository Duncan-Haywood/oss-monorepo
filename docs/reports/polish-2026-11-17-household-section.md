---
kind: polish
topics: [seo]
date: 2026-11-17
---
# Polish 2026-11-17: a `household` section for household money tools

Date: 2026-11-17. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-17-personal-tax-section.md` ("household health-bill tools and the household
borrowing tools in `solo-earner` are still in business sections") and item 3 of
`polish-2026-11-17-parents-job-changers-audiences.md` (the `roth|ira|rmd|social-security` test,
carried over three times). Open PRs searched (`list_pull_requests`, open, 50): none touch
`CATEGORY_RULES`.

## What changed

- `platform/pages/build.mjs`: `HOUSEHOLD_SLUGS` (31) and a `household` rule right after
  `personal-tax`. The slugs were taken out of the `services` and `backoffice` regexes, two
  `slug ===` lines and the `solo-earner` list (with their "joined" comments). Page copy in
  `CATEGORY_PAGE_COPY` (title 60 chars, description under 160).
- Moved: from `backoffice` 12 (medical-bill-error-checker, insurance-denial-appeal-builder,
  mortgage-escrow-analysis-checker, pslf-vs-refinance, solar-payback, subscription-audit-from-statement,
  adu-payback, heat-pump-vs-furnace, property-tax-appeal, texas-electricity-plan-checker,
  cheap-meal-plan-optimizer, tfsa-over-contribution-checker); from `services` 4
  (injury-settlement-net-proceeds, tenant-security-deposit-deadline-checker, wedding-budget-allocator,
  estate-sale-net-proceeds); from `solo-earner` 15 (mortgage, HELOC, rent-vs-buy, home-sale net,
  car lease, roommate rent, estate-item-divider, funeral price list, CD ladder, student loan plans,
  structured settlement buyout, aid award letters, card bonuses, Schengen days).
  `charity-bunching-planner` went to `personal-tax`.
- Left out on purpose: landlord tools (rent-roll, rent-increase-notice-checker, security-deposit-return,
  rental-ledger, house-hack), employer/candidate `h1b-weighted-lottery-odds`, investor
  `covered-call-wheel`, self-employed SEP-IRA tools, `severance-package-calculator` and
  `state-residency-day-counter` (both read as pay/tax, candidates for `personal-tax` next).
- `platform/pages/home.mjs`: an icon (house with a heart). `home.test.mjs` requires it.
- Tests in `build.test.mjs`: nine household tools pinned to `household`, six landlord/business ones
  pinned away from it; section count 17 -> 18; a new test that every non-UK, non-SEP slug matching
  `(roth|ira|rmd|irmaa|medicare|social-security)` lands in `personal-tax` (passes today: 11 slugs).
- `ventures/README.md` regenerated.

## Verification

See the run record's `notes` for the build, `check.mjs` and test output.

## Still weakest, and what I would do next

1. **`severance-package-calculator`, `state-residency-day-counter`, `feie-physical-presence-calculator`,
   `us-substantial-presence-test-calculator`** are personal tax/pay questions still in `backoffice`.
2. **No `for-homeowners` / `for-renters` audience page.** The household section now has the tools;
   an audience page for homeowners (escrow, points, HELOC, solar, heat pump, property-tax appeal)
   would clear `MIN_AUDIENCE_TOOLS` easily.
3. Carried over: the audience `starting` note still reads as a business call-out; split `backoffice`.
