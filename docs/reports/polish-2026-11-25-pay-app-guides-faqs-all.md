# Polish 2026-11-25: FAQ on every pay-app guide (bet #1's front door)

Track: polish/0. Follows `polish-2026-11-25-pay-app-guides-faqs.md` (5 pages,
8 → 13 of 25).

## Measured (before)

`ventures/pay-app-guides`, 25 pages: one `h1` each, canonical, in
`sitemap.xml`, titles 19–51 characters, descriptions 136–159. **12 of 25** had
no `FAQPage` and no visible Q&A: change orders and the SOV, joint checks, lien
waiver forms by state, Miller Act, overbilling/underbilling, paid short, pay
application checker, software compared, retainage in QuickBooks, retainage
release, sworn statement, T&M tickets.

## What changed

- Each of the 12 gets a `<section class="card" id="faq">` with three `h3`/`p`
  pairs before the early-access card, and a matching `FAQPage` block in
  `<head>` (written by one script so markup and visible text are identical).
  Answers restate only the page's own content and keep its sources and hedges;
  no new facts or figures.
- `page.test.mjs`: `FAQ_PAGES` now lists all 25; a new test fails when any
  `.html` in the folder is missing from that list (mutation-checked: dropping
  `tm-tickets.html` from the list fails it).
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`.

## Verification

- `node --test ventures/pay-app-guides/*.test.mjs`: 237/237 pass.
- `node --test platform/pages/faq-visible.test.mjs faq-duplicate.test.mjs faq-coverage.test.mjs`: 28/28.
- Playwright at 390 px on all 12 pages: `scrollWidth == clientWidth` (390),
  3 FAQ `h3` each, 0 page errors. Screenshot of the T&M FAQ card looked right.

## Still weakest, what I would do next

1. `pay-application-generator` (the other public front door to bet #1): check
   its two pages for the same FAQ/answer-first coverage.
2. None of the pay-app guide sources carry `og:image` themselves; the site
   build draws share cards, so confirm on the live site that each guide's card
   names the guide, not the product.
3. Carried from earlier polish notes: 3,960 meta descriptions cut with "…";
   og:title on einvoice country guides.
