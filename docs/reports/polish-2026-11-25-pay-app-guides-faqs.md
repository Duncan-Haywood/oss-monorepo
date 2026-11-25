---
kind: polish
topics: [aeo, seo]
date: 2026-11-25
---
# Polish, 2026-11-25: visible FAQs + FAQPage on five pay-app guides (bet #1 front door)

Track: polish/0. Both "next" items from the previous pay-app notes were already done on
main: the lien-waivers guide header is down to 6 links, and
`mechanics-lien-deadline-calculator` already links the waiver, prompt-payment and Miller
Act pages. So I looked wider at the same product.

## Measured

`ventures/pay-app-guides`, 25 pages: every page has one `h1`, sits in `sitemap.xml`, and
(apart from `index.html`) is in `llms.txt`. **17 of 25 had no `FAQPage`** and no visible
question-and-answer section, including the highest-intent guides.

## What changed

- A visible "Common questions" card (3 Q&A each, `h3` + `p`, same markup as
  `retainage-tracker.html`) before the early-access CTA, plus a matching `FAQPage`
  JSON-LD block in `<head>`, on: `conditional-vs-unconditional-lien-waivers`,
  `retainage-explained`, `how-to-fill-out-a-pay-application`, `prompt-payment-laws`,
  `pay-if-paid-clauses`. Answers restate only what each page already says, with its hedges
  ("a question for a construction attorney"). No new facts, no statute figures beyond the page's own table.
- `page.test.mjs`: new test with a list of FAQ pages (may only grow). Each must keep `FAQPage`
  (top-level, array or `@graph`), and every marked-up question must be an `h3` in the page's
  `id="faq"` section. Mutation check: renaming one visible question fails it.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`
  (consolidation, no new short post).

FAQ coverage: 8 of 25 to 13 of 25 pages.

## Verification

- `node --test ventures/pay-app-guides/*.test.mjs`: 236/236 pass.
- `node --test platform/pages/faq-visible.test.mjs platform/pages/faq-duplicate.test.mjs`: 18/18 pass.
- Playwright Chromium 390×844, `pay-if-paid-clauses.html`: `scrollWidth` 390 (no sideways
  scroll); the FAQ card is 938 px tall. Screenshot: `img/polish-2026-11-25-pay-app-faq-390.png`.

## Still weakest, next

1. 12 pay-app guides still have no FAQ: `change-orders-schedule-of-values`, `joint-checks`,
   `lien-waiver-forms-by-state`, `miller-act-payment-bond-claims`, `overbilling-underbilling`,
   `paid-short`, `pay-application-checker`, `pay-application-software-compared`,
   `retainage-in-quickbooks`, `retainage-release`, `sworn-statement`, `tm-tickets`
   (`pay-application-checker` and `software-compared` first: both are close to buying intent).
   Add each to `FAQ_PAGES` in `page.test.mjs`.
2. Bet #2's front door (`machine-shop-guides`) has not been measured the same way.
3. Carried: meta descriptions over 160; og:description list (saints-by-candlelight 178 is
   most of it, not a paid product).
