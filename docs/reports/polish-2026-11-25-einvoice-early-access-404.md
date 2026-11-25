---
kind: polish
topics: [seo, money]
date: 2026-11-25
---
# Polish, 2026-11-25: einvoice-preflight early-access link was a 404 on 226 pages

## What I picked and why

Bet #3 (e-invoice fix-and-explain) has one funnel step on the public site: the
"in development, early access" link on `einvoice-preflight/` and its 225 rule
pages (`rules/{de,fr,en}/*.html`). While surveying the industry pages (the paid
products' front doors) I found `front-doors.json` keyed `e-invoicing` while the
built page is `industries/eu-e-invoicing/`. Probing the live site:

| URL | Status (2026-11-25) |
|---|---|
| https://marisstella.app/industries/e-invoicing/ | 404 |
| https://marisstella.app/industries/eu-e-invoicing/ | 200 |

226 built pages linked the 404 (all einvoice-preflight). The same slug was in
`portfolio/monetization/transition.json`/`.py` (`paid_page`), the venture's
README, `llms.txt` and VENTURE.yaml.

## What changed

- Every source now says `industries/eu-e-invoicing/`: `rules/build.mjs` (then
  `node rules/build.mjs`, output identical to the sed'd files), `rules.test.mjs`,
  `index.html`, `llms.txt`, README, VENTURE.yaml, transition.json/.py.
- `front-doors-map.mjs`: key `e-invoicing` -> `eu-e-invoicing`; regenerated
  `front-doors.json`. `liveIndustries()` drops a door whose page is not built,
  so the eu-einvoicing-mandate-checker door to the e-invoicing product had
  never rendered. New test in `front-doors.test.mjs`: every map industry is a
  slug from `business.mjs` `industriesWithProducts()` (the old test compared
  against its own hardcoded list, which had the same wrong slug). Mutation
  check: putting `e-invoicing` back fails it.
- `check.mjs`: links that start with the site's own origin (the hub canonical,
  `siteBase`) are resolved like site links (`siteRelativeLink`), and an
  extension-less link from HTML resolves to `x.html` (Cloudflare pretty URLs;
  `curl` confirmed `/rules/en/br-27` is 200). Tests in `check.test.mjs`.
- No redirect stub at the old URL: it has only ever served 404, so nothing
  working points at it.

## Measured

- Absolute same-origin links in the pre-fix dist: 17,297 across 13,551 HTML
  files. With pretty-URL resolution, dead targets: `industries/e-invoicing/`
  (226), `deploy/` (2, written after the check, already exempt), `grants/`
  (1, worker-served, already exempt).
- `node platform/pages/check.mjs` on the pre-fix dist with the new check:
  exactly 226 problems, all this link. After the fix: see the run record.

## Still weakest, next

1. Other hand-written slugs that name a built page (category ids, `c/for-*`
   audience pages) could drift the same way; the dead-link check now covers
   absolute links, but a door that silently does not render (as
   `liveIndustries` does) is still invisible. A test that every key in a map
   resolves to a built page would catch that class.
2. Carried: four pay-app pages with 6 header links; meta descriptions over 160;
   saints-by-candlelight og:descriptions (not a paid product).
