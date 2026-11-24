---
kind: analysis
date: 2026-11-24
subjects: [pages]
topics: [money, distribution]
---
# Free tools as front doors to industry pages (2026-11-24)

**What:** `platform/pages/front-doors-map.mjs` (rules and hand lists) writes
`platform/pages/front-doors.json`: 204 tool slugs, plus 12 category and
audience page ids (`trades`, `marketplace`, `for-roofers` and others), each
mapped to an industry slug (`construction`, `manufacturing`, `online-sellers`,
`e-invoicing`, `nonprofits`). `platform/pages/front-doors.mjs` renders:

- on a mapped tool, a `p.pf-door` first in the chrome footer (`injectChrome`'s
  `door`);
- on a mapped category or audience page, a `p.door` right after the hero
  (`renderCategoryPage`).

Both link `industries/<id>/` with `data-pf-to="industry:<id>"`. The existing
local counter records clicks as `cross_tool_click:industry:<id>`.

**Gate:** a door renders only if `dist/industries/<id>/index.html` exists.
Tool pages check this in `addSiteChrome`, and category pages are pruned right
after it (`pruneDoors`). The industry pages belong to a sibling session's hub
work. **They must be written before `addSiteChrome` runs, or every door stays
hidden.** When this PR merged they did not exist yet, so no door was live.

**Rules for edits:** change the rules in `front-doors-map.mjs`, then rerun it.
`front-doors.test.mjs` fails when the JSON is stale. A paid product
(`transition.json`, "proprietary") is never a door, and tokens match whole
slug words in business categories only. Industry copy must state its
early-access status and name no price.

**Also:** the category-page h1 drops a leading "Free" (`heroTitle`), while
`<title>`/og:title stay as they were. The count line reads "N tools · free, no
account · …".

**Overlap:** PR #18677 (open when this landed) adds a hand-curated
`p.pf-product` footer line linking free tools to *product* pages. If both
land, one footer can hold both lines (for example `drywall-bid-calculator`
gets wall-framing-takeoff and the construction door). Consider showing just
one per page once the industry pages say which product each sells.
