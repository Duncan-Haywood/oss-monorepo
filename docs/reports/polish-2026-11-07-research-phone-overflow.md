---
kind: polish
topics: [mobile, research, layout]
date: 2026-11-07
tagged: auto
---
# Polish 2026-11-07: /research/ scrolled sideways on a phone

**Checked.** Full build and `check.mjs` (1330 products, 7456 pages, no dead links). Then a 390 px probe
(`scrollWidth` vs `clientWidth`) on the hub, `/research/`, two research pages, Stories and About.
Only `/research/` failed: scrollWidth 407 against 390.

**Cause.** In `research/_homepage/template.html` the single-column `.feat-grid` used `1fr`, which is
`minmax(auto,1fr)`, so unbreakable text (a theme tag such as `Ongoing · marriage-divorce-evi...`) widened the column.

**Fix.** `minmax(0,1fr)` on the mobile grid, `overflow-wrap:anywhere` on `.theme-tag` and `.feat h3`.
After: scrollWidth 390 on the rebuilt page (`research/_homepage/build.py --out`). The chip row still scrolls
inside its own nav, which is intended. Not re-run through the full build; no ranking or traffic claim.

**Next.** Probe more page types at 390 px (blog posts, flagship pages, category pages); a sweep script over a
sample of `dist/` that fails on page-level sideways scroll would make this routine (README has the manual check).
