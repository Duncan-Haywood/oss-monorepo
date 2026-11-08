---
kind: polish
topics: [seo]
date: 2026-11-06
tagged: auto
---
# Polish 2026-11-06: clean sweep, nothing to fix

**Measured on a fresh build** (1,330 products, 7,292 pages): `check.mjs` reports no dead links.

- `propose_seo_titles.py --check` exits 0. The over-70-character title backlog from the 2026-10-31 batches is empty.
- `missing_llms_txt.py` prints nothing: every product has an `llms.txt`.
- A scan of every `index.html` found no page without a meta description, `lang` or `og:image`.
- At 390 px, `scrollWidth` equals the viewport on the hub, Stories, Research, the writing index, the lab and a post. No sideways scroll.

**False alarms to skip next time.**

- `/lab/` and `/lab/handoff/` have no canonical tag by design: they are `noindex` (`lab.mjs`).
- Six posts and two lab pages look over 170 characters in the rendered meta description. The source is within the 160 limit that `writing.mjs` enforces; the count includes `&#39;`-style escapes.
- Four `<img>` without `alt` in `social-preview-check` and `page-seo-audit` are sample HTML in the tools' demo text.

**Still weakest (not measured this run).** Contrast and Lighthouse numbers, and visual (not just reflow) review of Stories and Research at phone width. The next polish run should screenshot those and judge the design, since the structural checks are clean.
