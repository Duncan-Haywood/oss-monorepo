# Funnel events: `data-funnel` markup

Which free pages send people toward a paid product? Page-view counts cannot
say. These events can, using the same first-party counter, the same beacon and
the same off switches as the page-view count (`README.md` beside this file).

## The markup

Add attributes to elements the page already has. Nothing else is needed: the
shared chrome script (`pf-site.js`, built from `platform/pages/build.mjs`,
`CHROME_SCRIPT`) finds them on every page that loads it.

| `data-funnel=` | Put it on | Counted |
|---|---|---|
| `industry-page` | any element of an industry landing page (e.g. its `<main>`) | `industry_view`, once per load |
| `products-page` | any element of `/products/` (or another product index) | `products_view`, once per load |
| `cta` | the block or link that promotes a paid product on a tool, category or post page | `cta_view` when at least half of it (or half the screen's height, for a tall block) is on screen, once per load per industry and product; `cta_click` on every click inside it |
| `outbound` | a link to a product's site, sign-up, pricing or early-access form | `outbound_click` on every click |

Two optional attributes say what the event is about. Each is looked up on the
element itself first, then on its ancestors, so a page can set it once on
`<body>` or `<main>`:

- `data-funnel-industry="restaurants"`: the industry, as a slug the page owns
  (use the industry page's own slug so the report joins up);
- `data-funnel-product="menu-suite"`: the product, as its venture slug.

Both must match `^[a-z0-9][a-z0-9-]{0,59}$` (`FUNNEL_TOKEN_RE` in `core.mjs`).
Anything else is dropped from the event, which is still counted.

```html
<main data-funnel="industry-page" data-funnel-industry="restaurants">
  ...
  <aside data-funnel="cta" data-funnel-product="menu-suite">
    <p>Menu Suite keeps every recipe cost current.</p>
    <a href="https://menu.example/early-access" data-funnel="outbound">Join the early-access list</a>
  </aside>
</main>
```

A click on that link counts `cta_click` and `outbound_click`, both under
`restaurants` and `menu-suite`. Use `outbound` alone for a product link that
is not a promoted block (a row in a product table, say).

## What is sent and stored

One `sendBeacon` per event to the counter's `POST /hit`, body
`{"p":"<page slug>","e":"<event>","i":"<industry>","t":"<product>"}` (`i` and
`t` only when set). The counter (`core.mjs`, `classify`) refuses an unknown
event, a crawler, or a bad page slug, and adds one to the day's

```
fn:<event>:<industry or _>:<product or _>:<page slug>
```

and nothing else: no country, no device, no page-load total. It is a daily
tally like every other key, published in `portfolio/usage/site-visits.json`.
No identifier, cookie or storage is involved, so it needs no consent, and the
site's "Don't count my visit" opt-out stops it like the page-view beacon
(`portfolio/usage/README.md`, rule 1). The About page and `llms.txt` say so
(`platform/pages/build.mjs`, the privacy copy beside `counterOn()`).

It is **not** a cross-page funnel: the counter cannot link an impression on
one page to a click on another, or either to a visitor. Rates are ratios of
daily totals.

## Reading it

```sh
node platform/counter/usage-data.mjs sync        # copy the daily pull into portfolio/usage/
node platform/counter/funnel-report.mjs          # last 28 days, Markdown to stdout
node platform/counter/funnel-report.mjs --days 7 --out portfolio/usage/reports/funnel.md
```

How to read the numbers, and their traps:
[`docs/reports/2026-11-24-funnel-events.md`](../../docs/reports/2026-11-24-funnel-events.md).

## Tests

```sh
node --test platform/counter/funnel-core.test.mjs platform/counter/funnel-report.test.mjs \
  platform/pages/funnel-wiring.test.mjs platform/pages/counter-wiring.test.mjs platform/edge/worker.test.mjs
```
