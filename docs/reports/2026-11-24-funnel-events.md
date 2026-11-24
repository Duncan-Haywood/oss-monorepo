# Funnel events: how to read the product funnel

Date: 2026-11-24. For: the next session asking "which free tools, category
pages and industry pages send people toward our paid products?" (North star,
`prompts/goals.md`: free pages exist to bring buyers to the products).

## What landed

- `data-funnel` markup any page can carry: `industry-page`, `products-page`,
  `cta`, `outbound`, plus optional `data-funnel-industry` and
  `data-funnel-product` (reference: `platform/counter/FUNNEL.md`).
- The shared chrome script (`pf-site.js`) turns that markup into beacons on
  the existing first-party counter, through the same `sendBeacon` call as the
  page-view count, behind the same "Don't count my visit" opt-out.
- The counter (`platform/counter/core.mjs`, the `platform/edge/` Worker and
  the Node counter) accepts a closed list of five events and keeps one daily
  integer per `fn:<event>:<industry>:<product>:<page>`. The Worker redeploys
  on merge (`edge-deploy.yml` watches `platform/edge/**` and `core.mjs`).
- `node platform/counter/funnel-report.mjs` turns the pulled counts into a
  per-industry, per-page and per-product table.
- The About page's privacy copy and `llms.txt` now say product-link impressions
  and clicks are counted.

**Nothing is measured until pages carry the markup.** Sibling sessions own
page content; this change only adds the mechanism. Until a page has
`data-funnel` attributes, the report says "No funnel events in this window",
which means unmeasured, not zero.

## Reading the report

```sh
node platform/counter/usage-data.mjs sync      # copy the daily pull from the usage-data branch
node platform/counter/funnel-report.mjs        # last 28 days to stdout
```

Columns, per industry (and again per page and per product):

| Column | Means | Use it for |
|---|---|---|
| Industry page views | loads of a page marked `industry-page` | top of the funnel for that industry |
| /products/ views | loads of the product index | whether people go looking for products at all |
| CTA impressions | a product CTA at least half on screen, once per load | how often a front door actually shows its product |
| CTA clicks | clicks anywhere inside a CTA block | intent |
| CTA click rate | clicks / impressions | which CTA copy or placement works |
| Outbound clicks | clicks on a product site, sign-up or early-access link | the last step this site can see |
| Outbound per industry view | outbound clicks / industry page views, same industry | how well an industry's whole set of pages converts |

The "Front doors" table ranks pages by CTA clicks plus outbound clicks: that is
the answer to "which free pages send people toward products". A page with
many impressions and no clicks is a CTA nobody wanted; a tool page with many
page loads (from `usage-data.mjs top --tools`) and no impressions has no CTA or
one nobody scrolls to, and is the cheapest place to add one.

## Traps

- **Counts, not people.** Each number is a daily total of events on page loads
  by browsers that did not opt out. Do not write them up as visitors, users or
  leads.
- **Not a real funnel.** The counter links nothing across pages or to a
  person: an outbound click on a tool page is not known to follow an industry
  page view. Rates are ratios of daily totals, so treat a rate over a few dozen
  events as noise. Linking steps per visitor would need an identifier and EU/UK
  consent (`portfolio/usage/README.md`, rule 1); that was deliberately not done.
- **Impressions depend on the browser.** Without `IntersectionObserver`
  (very old browsers) a CTA counts as seen at load, so impressions read a
  little high there.
- **Industry is what the page says.** An event's industry is the nearest
  `data-funnel-industry`. A page that forgets it lands under `(none)`; fix the
  markup rather than guessing in the report.
- **Clicks can double-count by design.** An `outbound` link inside a `cta`
  block counts both a CTA click and an outbound click; they answer different
  questions. Do not add the two columns together as "people".
- **What happens after the click is not here.** Sign-ups and payments belong
  to the product's own records (`portfolio/monetization/mrr.yaml`). This report
  stops at the link.
- **Caps.** The Worker caps each key at 20,000 a day; a key at the cap is
  scripted traffic, not a success.

## Next steps (not done here)

- Pages: siblings add `data-funnel` to industry pages, `/products/`, the CTA
  blocks on tool and category pages, and outbound product links.
- Daily file: `engagement-report.mjs` could include a funnel section, or the
  `site-usage-pull` workflow could also run `funnel-report.mjs --out
  portfolio/usage/reports/funnel.md`. That workflow is under `.github/`
  (owner approval), so it belongs in its own small PR.
