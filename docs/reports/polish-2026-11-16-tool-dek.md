---
kind: polish
topics: [seo, design]
date: 2026-11-16
---
# Polish 2026-11-16: tool project pages lead with their llms.txt summary

Track: polish/0. Picked item 3 of "Still weakest" in `polish-2026-11-16-project-pages.md`
("The project pages have no lede beyond a generic sentence"), carried over through
`polish-2026-11-16-programme-dek.md` (item 2) and `polish-2026-11-16-hero-art.md` (item 4).
Open PRs: none touched `writing.mjs` when this run started.

## What changed (`platform/pages/writing.mjs`)

- `ventureLede(slug, root, max = 320)` reads the venture's `llms.txt`, takes the first `> `
  block (consecutive `>` lines joined), keeps link text, drops backticks and bold markers, then
  runs `researchLede` over it (whole sentences up to `max`, a first sentence whole up to 1.5 times
  that, else clipped at a word). The text is escaped first, so a `<` in a summary survives the tag strip.
- `projectGroups` defaults `ledes` to `ventureLede` for the tools topic. The research topic
  still passes its registry ledes. The page uses `project.lede` for both topics: the dek, the meta
  description (160 characters, `stretch: 1`) and the `CollectionPage` description.
- Test: `ventureLede: a tool project page leads with its llms.txt summary` in `writing.test.mjs`.

## Measured (writing-only build, before vs after, `diff -rq`)

- 17 files differ, all `writing/topic/tools/<slug>/index.html`. Nothing else changed.
- Specific dek: 0 of 17 before, 17 of 17 after. Lede lengths: 74 to 370 characters.
- Wall Framing Takeoff (Playwright, file://): dek 87 → 232 px at 390, 58 → 116 px at 1,280.
  First post top 469 → 614 px at 390, 351 → 409 px at 1,280.
- Screenshots: `img/polish-2026-11-16-tool-dek-{before,after}-{390,1280}.png`. The header
  looks unstyled in these because the writing-only build doesn't get the header CSS that
  build.mjs injects. That isn't a defect on the live site.

## Still weakest, and what I would do next

1. **Two summaries clip with an ellipsis** (babysitting-business-kit, wall-framing-takeoff;
   ai-bookkeeper at 364 and photo-editing at 370 stay whole but are long). Fix it at the source: a short first
   sentence in each `llms.txt` `>` line helps assistants as much as the page. Do it in a venture
   run, not here.
2. **The tools topic index cards** (`writing/topic/tools/`) still list projects by name and count
   only. A one-line lede (first sentence of `ventureLede`) under each name would make the index
   scannable.
3. Carried over: 401 research and 409 tool posts name no project; the hub's empty right half
   at 1,280 px; the 1,280 px "By programme" block is 363 px.
