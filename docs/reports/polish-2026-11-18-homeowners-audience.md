---
kind: polish
topics: [seo]
date: 2026-11-18
---
# Polish: "homeowners" audience page

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-17-household-section.md` ("No `for-homeowners` / `for-renters` audience page").
Open PRs listed (`list_pull_requests`, open, 60): none touch `audiences.mjs`.

## What changed

- `platform/pages/audiences.mjs`: `homeowners` (title 59 chars, description 158). The slug rule
  claims 13 tools: adu-payback, heat-pump-vs-furnace, heloc-vs-cash-out-refinance, hoa-reserve-fund,
  home-sale-exclusion, home-sale-net-proceeds, mortgage-escrow-analysis-checker,
  mortgage-extra-payment-vs-invest, mortgage-points-break-even, property-tax-appeal,
  rent-vs-buy-breakeven, solar-payback, uk-mortgage-overpayment. Each tool's meta description was read
  so the intro claims nothing the tool doesn't do. The first draft said the escrow tool checks "a shortage notice line
  by line". It compares the statement with your tax and insurance bills, so the wording was fixed.
- One overlap: heat-pump-vs-furnace is also on `hvac`. Left as is (overlap is allowed by design).
- Left out on purpose: solar-pv / furnace / standby-generator bid calculators (installer side),
  standby-generator-install-price (installer), section-24-mortgage-interest (UK landlord),
  house-hack, rental-dscr, home-inspection-fee. `audiences.test.mjs` pins both sides.
- `README.md` links the page.

## Measured

`--only` preview of the 13 slugs, Playwright: at 390 px light and 1,280 px dark, scrollWidth equals
the viewport. One h1, `CollectionPage` JSON-LD, 13 tool links. Full-build and test output are in the
run record `notes`.

## Still weakest, and what I would do next

1. **Renters page: 3 tools** (roommate-rent-splitter, tenant-security-deposit-deadline-checker,
   rent-vs-buy). Below `MIN_AUDIENCE_TOOLS`. A real fourth tool (a lease-break cost calculator, or
   renters-insurance vs deposit) would be a ventures job and would unlock it.
2. **The audience intro runs to about 350 px on a phone** (here and on retirees): the 80 to 90-word
   intros push the "Start here" cards below the first screen at 390 px. Cap intros at ~60 words, or
   collapse the tail behind the `starting` callout. Measure every `for-*` page first.
3. Carried over from `polish-2026-11-17-household-section.md`: item 1 (severance, residency-day and
   FEIE/substantial-presence tools still in `backoffice`), item 3 (the audience `starting` note's
   business call-out styling; split `backoffice`).
4. **`llms.txt` headroom is about 4 KB.** The "Tools by who you are" block is now 8.2 KB (32
   audiences with full descriptions). If it fills up again, list audiences as a single line of
   links and leave the descriptions to the pages.

## Side fix: root `llms.txt` over its byte budget

The page's one-line entry in the root `llms.txt` took the file to 50,113 bytes, and
`build.test.mjs` ("llms.txt is a short index", < 50,000) failed. Main was about 130 bytes under it,
so the next new tool or audience would have failed it too. The "Comparisons" block repeated
"each saying what it does, what the free tool does, and when X is the right answer" on all 45
product lines. `build.mjs` now says it once on the parent line. About 4.4 KB saved. The final size
is in the run record.

