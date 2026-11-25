---
kind: note
subjects: [pages]
---
# Manufacturing industry page: what landed and the follow-up

`platform/pages/industry-manufacturing.mjs` builds `industries/manufacturing/`
(tests: `industry-manufacturing.test.mjs`). `build.mjs` calls
`buildManufacturingPage` right after the engineering page; `check.mjs` lists
`industries` in `SITE_OWN_DIRS` so the directory is not treated as a product.

## State

- Indexed and in the hub sitemap (`industryPages` in build.mjs, next to the
  nonprofits page). It is reachable from the hub through the front doors that
  `front-doors.json` maps to `manufacturing`: ten tool pages link here once
  the page is built.
- Products and problems are local data in the module. There is no
  `business.mjs` on main yet.
- A free tool is listed only if the build publishes it (`published`).
  `machine-shop-guides` (the SPRS calculator) is not in `launched.json` yet;
  it shows up when it is.
- The early-access link goes to the open request form
  (`custom-development/?kind=new#request`). The hello@ inbox is not confirmed
  live (`portfolio/brand/README.md`), so it is not used.

## Follow-up

1. Link `industries/manufacturing/` from the `industries/` index once one exists.
2. If `business.mjs` lands with product records for bets #2 and #4, read
   `PRODUCTS` from it; keep the honesty tests.
3. Swap the early-access link for a real sign-up when one exists.

## Facts

The regulator hosts (ecfr.gov, dodcio.defense.gov) were unreachable from the
session. The Level 1 facts (the 15 FAR 52.204-21 requirements, annual
affirmation) and the SPRS range (110 to -203) are cited from the sources in
`ventures/machine-shop-guides/SOURCES.md`, which a sibling session collected.
