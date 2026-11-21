---
kind: polish
topics: [seo, design]
date: 2026-11-21
---
# Polish 2026-11-21: a Sales, quotes & invoicing section

Date: 2026-11-21. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-21-bookkeeping-section.md` (Sales Agent's breadcrumb was "Creator & solo earner
income"). `polish_queue.py` showed no open polish PR; claimed with draft PR #18072 before building.

## What changed

1. **`SALES_SLUGS`** (exported, 16 exact slugs) and a **`sales` rule placed second** in
   `CATEGORY_RULES` (after `self-hosted`, so no earlier prefix claims a member): freelance-lead-tracker,
   sales-cadence-builder, sales-call-notes-desk, sales-agent, freelance-proposal-maker, proposal-maker,
   freelance-contract-maker, estimate-maker, time-tracker, invoice-maker, invoice-payment-terms-calculator,
   invoice-aging-late-payer-analyzer, late-invoice-collections-kit, freelance-dashboard,
   sales-commission-plan-comparison-calculator, sales-quota-capacity-planner.
2. Dead exact entries removed from `solo-earner` (11), `services` (2) and `backoffice` (1);
   `NOT_EVIDENCE_SLUGS` loses the three that `sales` now takes first.
3. `CATEGORY_PAGE_COPY.sales`: 58-char title, 140-char description, a 37-word intro.
   Hub icon `sales` in `home.mjs` (receipt with a rising line).
4. Tests: `build.test.mjs` "the lead-to-invoice pipeline files under sales, and no later rule still
   names a member" (also asserts 8 near-misses stay out); section count 19 → 20; `home.test.mjs` icon list.

Kept out on purpose: the contractor quote tools in trades (quote-follow-up-timing,
revenue-target-lead-planner, project-estimate-calibrator, lead-response-time-analyzer,
home-service-lead-roi-analyzer), thumbtack-lead-roi-calculator (marketplace), expense-tracker and
freelancer-tax-pack (solo-earner, the tax side), and invoice CSV checks (bookkeeping).

## Measured

Counts over `ventures/` (all directories, `categoryFor`): solo-earner 77 → 67, services 196 → 194,
trades 210 → 208, backoffice 173 → 171, sales 0 → 16. Catch-all unchanged.

`--only=sales-agent,invoice-maker,c/sales` preview: Sales Agent's `BreadcrumbList` position 2 is
"Sales, quotes & invoicing" → `/c/sales/`. Category page: 16 tools, scrollWidth 390 at 390 and 1280 at
1280. The first draft's description (175 chars) was cut with "…" in the meta tag and its 80-word intro
pushed the filter field below the 390×844 fold; both shortened before merge.

## Still weakest, and what I would do next

1. **evidence still mixes three jobs** (carried from the bookkeeping report, item 2): regulation checkers,
   CRM and email-tool import CSV checks (hubspot, salesforce, klaviyo, mailchimp, brevo, pipedrive, zoho,
   activecampaign, google-contacts), and dated evidence records. A "Data imports" section, or moving the
   CRM imports next to `sales`, is the next taxonomy fix.
2. **Sales Agent ships a Dockerfile and fly.toml** but sits in `sales`, not `self-hosted`. Right for a
   visitor (it runs in the browser first), but the hub's self-hosted count does not mention it. A
   "can also self-host" badge on the card would say both.
3. **The trades sales tools** (quote follow-up, lead response time) are general enough for any service
   business. If an audience page for agencies or consultants appears, link them from there rather than
   moving them.
