# Manufacturing industry page: what landed and the follow-up

`platform/pages/industry-manufacturing.mjs` builds `industries/manufacturing/`
(tests: `industry-manufacturing.test.mjs`). `build.mjs` calls
`buildManufacturingPage` right after the engineering page; `check.mjs` lists
`industries` in `SITE_OWN_DIRS` so the directory is not treated as a product.

## State

- `INDEXED = false`: the page carries `noindex` and is not in the sitemap,
  because nothing on the hub links to it yet and `check.mjs` requires every
  indexable page to be reachable from `index.html`.
- Products and problems are local data in the module. `business.mjs` (the
  sibling foundation PR) was not on main when this landed.
- Early-access link goes to the open request form
  (`custom-development/?kind=new#request`). The hello@ inbox is not confirmed
  live (`portfolio/brand/README.md`), so it is not used.

## Follow-up (for whoever lands the industries index or `business.mjs`)

1. Link `industries/manufacturing/` from the `industries/` index.
2. Set `INDEXED = true` and add the URL to `renderHubSitemap` in build.mjs.
3. If `business.mjs` holds product records for bets #2 and #4, read `PRODUCTS`
   from it instead of the local copy; keep the honesty tests.
4. Swap the early-access link for a real sign-up when one exists.

## Facts not used

A fact-check of these CMMC details could not reach ecfr.gov, dodcio.defense.gov
or acq.osd.mil from the session (DNS blocked), so they were left off the page:
Level 1 = the 15 FAR 52.204-21 requirements with annual affirmation; SPRS score
range 110 to -203. Add them with a source once checked.
