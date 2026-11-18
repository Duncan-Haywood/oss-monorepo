---
kind: polish
topics: [design, seo]
date: 2026-11-17
---
# Polish: US personal tax, pay & retirement gets its own section

Date: 2026-11-17. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-17-breadcrumb-categories.md` ("`services` holds about 24 household tax, retirement
and legal tools ... They want their own section"). Open PRs searched (`list_pull_requests`, open, 50):
none touch `CATEGORY_RULES` or breadcrumbs.

## What was wrong

US household tax, pay and retirement tools were spread over four business sections because each
was parked where its offline bundle had room: 34 in `backoffice`, 11 in `services`, 7 in
`solo-earner` and 1 in `food-service`. Measured on the built site before the change (390 px,
`.pfs-crumbs`):

| Page | Breadcrumb before | after |
|---|---|---|
| retirement-withdrawal-sequencer | Restaurant, bar & food truck pricing › … | US personal tax, pay & retirement › … |
| rmd-calculator | Back-office money & contracts › … | US personal tax, pay & retirement › … |
| nanny-tax-calculator (JSON-LD item 2) | Service business pricing & quotes | US personal tax, pay & retirement |

## What changed

- `platform/pages/build.mjs`: `PERSONAL_TAX_SLUGS` (53 slugs) and a `personal-tax` rule placed
  before `uk-tax`; the slugs were removed from the `services` and `backoffice` regexes and the
  `food-service` and `solo-earner` lists (the earlier rules would otherwise still win). Page copy in
  `CATEGORY_PAGE_COPY` (title "Free US personal tax, paycheck and retirement calculators").
- `platform/pages/home.mjs`: an icon (page with a dollar sign, twin of `uk-tax`'s).
- Tests: `build.test.mjs` pins seven household tools to `personal-tax` and six business-side tax
  tools (self-employment tax, quarterly estimates, solo 401(k), R&D credit, payroll deposit
  penalty, US freelancer set-aside) to `backoffice`; `home.test.mjs` requires the icon.
- `ventures/README.md` regenerated (it was also stale: 1,302 tools listed, 1,390 now).

Scope line: tax, paycheck and equity comp, Social Security, Medicare/ACA/COBRA and retirement
accounts. Left where they were on purpose: mortgages, student loans, CD ladders and other household
borrowing or investing in `solo-earner`; `401k-plan-fee-calculator` (plan sponsor) and
`installment-sale-tax-calculator` (business seller).

## Verification

- `categoryFor` over all 1,398 `ventures/` entries, before and after: exactly 53 lines differ, all
  `-> personal-tax`.
- `node platform/pages/build.mjs` then `node platform/pages/check.mjs`: "looks publishable: 1390
  products, 46 category pages, 11217 pages, no dead links."
- `/c/personal-tax/` lists 53 tools, one `h1`; `scrollWidth` 390 at 390 px and 1,280 at 1,280 px.
- `node --test platform/pages/build.test.mjs home.test.mjs ventures-readme.test.mjs`: 331 pass, 1 fail
  on the first run (the section count, 16 -> 17, an expected bump, now updated); the per-category
  offline bundle bound passes for the new section and the four it drew from. Six other
  `platform/pages` tests that read categories (audiences, heading-order, page-identity,
  related-tools, site-nav, venture-preflight): 73 pass, 0 fail.

## Still weakest, and what I would do next

1. **`h1b-weighted-lottery-odds-calculator`, `injury-settlement-net-proceeds-calculator`,
   `medical-bill-error-checker`, `insurance-denial-appeal-builder`, `cobra`-style household health
   tools and the household borrowing tools in `solo-earner`** are still in business sections. A
   "Household money & health bills" section, or widening this one, would finish the job.
2. **No audience page for retirees** (`/c/for-*/` exists for 30 trades, none for households). A
   `for-retirees` page pulling RMD, QCD, IRMAA, Social Security and withdrawal order would match a
   real query.
3. **New personal-tax tools need one line in `PERSONAL_TAX_SLUGS`**, or they fall to wherever
   their slug matches. A test that fails when a slug matching `/(roth|ira|rmd|social-security)/`
   lands outside `personal-tax` would keep it fixed.
4. Carried over from `polish-2026-11-17-breadcrumb-categories.md`: items 2 (split `backoffice`;
   less urgent now that 34 tools left it) and 3 (stale `trades` comments).
