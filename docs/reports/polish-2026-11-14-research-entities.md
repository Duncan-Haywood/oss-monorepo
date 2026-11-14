---
kind: polish
topics: [design]
date: 2026-11-14
---
# Polish 2026-11-14: research pages' double-escaped entities and raw emphasis

Track: polish/0. Picked from item 1 of `polish-2026-11-14-footer-link-contrast.md` (raw
`*variance*` on research "more in this topic" cards), which turned out to be the small end of a
bigger fault.

## What I measured

Fresh build of `research/_homepage/build.py` at `origin/main` (2b970b2e9) against the patched one,
both to `_site`:

| | old | new |
|---|---|---|
| `&amp;<entity>;` shown as text | 1,075 on 91 files (84 project pages, 6 topic pages, `more-cards.json`) | 0 |
| `<em>` | 5,277 | 5,188 (per page: 128 runs gone, nearly all false ones across formulas such as `10*32*3`; 35 real ones added in ledes) |
| `<strong>` | 4,803 | 4,805 (`**&mu;* = 0.855**` now bold) |
| `<code>`, `<a href="http` | 13,591, 5,904 | unchanged |

Most frequent: `&minus;` 200, `&times;` 188, `&ndash;` 157, `&delta;` 61. Sources: `LOG.md`
entries (most) and `research/README.md` ledes (e.g. energy-lcos-realised's `&ndash;`).

Screenshots (390 px, 2x): `img/polish-2026-11-14-entities-{before,after}-{log,more}.png`.

## What changed

- `build.py`: new `md_spans(text, links=False)`; `inline_md` (logs) and `readme_ledes` (cards,
  "more in this topic", topic pages, search data) both use it. Escape, restore typed entities,
  set code spans aside, then `**strong**`, word-bounded `*em*`, optional links.
- `platform/ci/test_research_homepage_publish.py`: a site-wide "no `&amp;entity;`" check and three
  unit tests of `md_spans`. Verified failing on the old builder (1 fail, 3 errors), passing now
  (14 tests OK).

## Still weakest, and what I would do next

1. **TeX-ish text outside code spans in ledes** (`m^{-1/2}`, `sqrt(s^2 + ...)` in marine-dr,
   `10^4` in selfrep-satmarket). Readable but plain; wrapping them in backticks in the
   project's `lede` (project.json) or README bullet is a per-project edit, not a builder one.
2. **The product side may have the same fault.** `grep -rhoE '&amp;[a-z]+;' platform/pages/dist
   --include=*.html | sort | uniq -c` outside `research/` was not checked this run; the blog
   (`docs/posts`) renderer is a different code path and worth the same sweep.
3. Carried over from earlier polish notes: `contrast.mjs` fallback without axe-core; blog post
   meta row at 1,280 px; answer leads on ~22 tools; lead cap 100 → 90.
