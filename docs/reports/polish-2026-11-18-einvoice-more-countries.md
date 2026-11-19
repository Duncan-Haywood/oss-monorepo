---
kind: polish
topics: [seo]
date: 2026-11-18
---
# Polish: einvoice-preflight's "More countries" block, one list for 93 pages

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-18-venture-reachability.md` ("other ventures with pasted related blocks may
have drifted the way framing's had; einvoice-preflight, 105 pages, is the likeliest"). No open
PR touched it (`polish in:title` search: #11730 and #14012, neither on these pages).

## What was wrong (measured on main before the change)

Each of the 93 `*-e-invoice-mandate.html` pages ends in a hand-pasted `<h2>More countries</h2>`
paragraph. The copies had drifted:

- A page linked **17 to 52** of the other 92 countries (Japan 17, Germany 29, Hungary 52).
- **5 country pages were linked from no other country page**: Bangladesh, Benin, Ethiopia,
  Malawi, Namibia. **25 more were linked from exactly one.** (All 93 were reachable from the
  by-country hub, so none was an orphan, just poorly connected.)
- **Wrong labels**: links to Armenia (2 pages), Azerbaijan (1) and Georgia (1) read "Moldova";
  others read "Uk", "Uae", "India Gst", "Singapore Invoicenow".
- 15 country pages had no link to the by-country hub at all.

## Changed

- `ventures/einvoice-preflight/more-countries.mjs`: `REGIONS` (European Union 27, rest of Europe
  and Central Asia 13, Middle East 6, Africa 17, Asia and Pacific 15, Americas 15), the block
  renderer, `drift()`, and a CLI (`--write` rewrites, no flag checks and exits 1 on drift). Same
  pattern as `wall-framing-takeoff/more-tools.mjs`.
- Every block now opens with a link to `e-invoicing-mandates-by-country.html` and lists the
  other 92 countries by region. Names never wrap mid-name and no line starts with a separator
  (`white-space:nowrap` on each link, `&nbsp;·` between). Two region columns at desktop width.
- `more-countries.test.mjs` (runs under the venture's `node --test`): no drift; every country
  page listed exactly once and only real pages; labels unique and matching each page's
  `<title>`; a page never links itself; the hub links every country.

## Measured

| | before | after |
|---|---|---|
| Other countries linked per page | 17 to 52 | 92 |
| Country pages linked from no sibling | 5 | 0 |
| Wrong labels | 4 links (+4 odd casings) | 0 |
| Block height, Germany, 390 px | 242 px | 1,259 px |
| Block height, Germany, 1280 px | 162 px | 625 px |
| Sideways scroll at 390 | none | none |

Screenshots: `docs/reports/assets/polish-einvoice-more-countries/` (`before-390.png`,
`after-390.png`, `after-1280.png`). The phone block is now about 1.4 screens tall, at the
page's foot after the FAQ, which is where a reader looking for another country goes.

Checks run: `node --test more-countries.test.mjs` (5/5),
`python3 platform/ci/run_venture_tests.py einvoice-preflight` (2,744 tests, 0 failed),
`node platform/pages/venture-reachability.mjs` (every venture page reachable).

## Still weakest, and what I would do next

1. **The other 12 non-country pages** (`br-fr-error-codes.html`, `sdi-error-codes.html`,
   `e-invoicing-deadlines-2027.html`, `vs-avalara.html` …) have their own hand-written "related"
   lines. They're few enough to read by eye; worth one look.
2. **A phone reader may want the block folded.** 1,259 px is fine at the foot, but a
   `<details>` per region (open on desktop) would halve it. Measure before deciding.
3. **Other ventures with country or state page families** (any `*-<state>-*.html` series) can
   drift the same way. `grep -c` the pasted blocks' link counts per page: a spread like 17 to
   52 is the tell.
