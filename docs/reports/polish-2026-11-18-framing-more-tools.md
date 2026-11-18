---
kind: polish
topics: [seo, design]
date: 2026-11-18
---
# Polish: Wall Framing Takeoff's "more tools" block, from 45 pasted copies to one grouped list

Date: 2026-11-18. Track: polish/0. The phone-header items in today's other polish reports were
taken several times over (#17145, #17147, #17273, #17276, #17295), so this run went to the top
flagship (`portfolio/flagships.yaml`) for an SEO pass instead.

## Found

- `brace-calculator.html` and `panel-calculator.html`: no JSON-LD at all (every other tool page
  has `FAQPage`), though both show three questions.
- The `nav.more-tools` block was pasted by hand into 45 pages and had drifted. Missing from 43 or
  44 of the 45: brace, panel, stucco, mulch-topsoil-gravel, vs-stud-per-foot-rule.
- BFS over in-venture links from `index.html`: 6 of 47 pages unreachable (brace, panel, stucco,
  vs-ordering-lumber-by-hand, branded-bid-package-for-framers, sample-bid-package).
  `check.mjs`'s site-wide hub reachability passes because the hub reaches them some other way.

## Changed

- `ventures/wall-framing-takeoff/more-tools.mjs`: `GROUPS` (9 trade groups, 46 pages), `moreTools(page)`,
  `drift()`, CLI check / `--write`. Inline styles: two columns from ~700 px, one on phones.
- `more-tools.test.mjs`: blocks match GROUPS; every page listed once and exists; no page left
  unlinked; in-venture reachability from index; visible Questions ⇒ `FAQPage` naming them.
- `FAQPage` JSON-LD on brace and panel pages, built from their visible Q&A text.

## Measured (Chromium, file:// pages, `nav.more-tools` offsetHeight)

| page | links | 390 px | 1,280 px |
|---|---|---|---|
| header-calculator, before → after | 36 → 45 | 1,754 → 1,624 | 1,020 → 1,029 |
| brace-calculator | 40 → 45 | 1,999 → 1,624 | 1,129 → 1,029 |
| index | 39 → 45 | 1,724 → 1,508 | 1,005 → 698 |

No sideways scroll at 390 or 1,280. Unreachable from venture index: 6 → 0.
`run_venture_tests.py wall-framing-takeoff`: pass (run record).

## Same defect elsewhere (scratch BFS over every venture with an index)

24 pages in 8 ventures had no in-venture route from their index before this. This PR also links
sales-agent's four cold-email checkers (SPF/DKIM/DMARC, list, sequence, warm-up) from its index's
Related line, so 14 remain: changepoint-detector (4: the analyst report page and three samples),
shed-designer (3), shift-roster-builder (2), einvoice-preflight (2),
babysitting-business-kit (`admin.html`, `self-host.html`, maybe intended), error-keeper
(`dashboard.html`, probably intended).

## Still weakest, and what I would do next

1. **shed-designer and changepoint-detector**: their buyer pages (`branded-shed-plan-pack-for-builders`,
   `change-report-for-analysts`) have no link from their own index, as framing's branded page had.
2. **A platform check** for in-venture reachability (the BFS in `more-tools.test.mjs`, run over
   every venture, with an allowlist for admin/dashboard pages) would stop the next one.
3. **Other ventures with pasted "related" blocks** may have drifted the same way; einvoice-preflight
   (105 pages) is the likeliest.
