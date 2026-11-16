---
kind: polish
topics: [seo, design]
date: 2026-11-16
---
# Polish 2026-11-16: research programme pages lead with their own summary

Track: polish/0. Picked item 2 of "Still weakest" in `polish-2026-11-16-programme-pages.md`
("Programme pages have a generic dek"). Open PRs searched: no open polish PR touches
`platform/pages/writing.mjs`.

## Measured (writing-only build, `node platform/pages/writing.mjs --out=<dir>`)

- Specific dek on `writing/topic/research/<slug>/`: 0 of 24 before, 24 of 24 after.
- Meta description length after: 86 to 160 characters (24 distinct). Before: 24 copies of one template.
- marine-hull (Playwright, file://): dek height 58 → 87 px at 1,280 and 87 → 174 px at 390. First
  post top 500 → 529 px at 1,280 and 579 → 666 px at 390.
- Screenshots (hero only): `img/polish-2026-11-16-programme-dek-{before,after}-{390,1280}.png`.
- Not a defect: the writing-only build at 390 px shows `scrollWidth` 438. Its `.pfs-nav` header
  is unstyled because build.mjs injects the header CSS. The live
  `marisstella.app/writing/topic/research/marine-hull/` measures 390. Don't chase it from a
  writing-only build.

## What changed (`platform/pages/writing.mjs`)

- `researchLede(summaryHtml, max = 320, { stretch = 1.5 })`: HTML stripped (`<sup>` → `^`,
  `<sub>` → `_`), entities decoded (`entities.mjs`), ASCII whitespace collapsed, so a decoded
  `&nbsp;` survives. Split into sentences, ignoring stops after "et al", "e.g", "i.e", "vs" and
  single capitals. Leading boilerplate (`LEDE_BOILERPLATE`, two patterns) is skipped. Whole
  sentences are taken up to `max`. Otherwise the first sentence is kept whole up to
  `stretch × max`, then clipped at a word with "…".
- `researchLedes(root)`: slug → lede from the research registry. `projectGroups` takes `ledes`
  and puts `lede` on research groups.
- `renderProjectPage`: on page 1, the dek is the lede and the meta description is
  `researchLede(lede, 160, { stretch: 1 })`. JSON-LD `description` is the lede. With no lede it
  falls back to the old blurb. Numbered pages are noindex and keep the blurb.
- `invokedDirectly` compares resolved paths. The old basename-suffix test ran a full blog build
  whenever a script named like `g.mjs` imported the module.
- Tests: `researchLede` unit cases, and a build where a programme's summary becomes the dek, meta
  description and JSON-LD description, with the generic line gone.

## Choices

- The dek often restates the `h1` question in longer form, with the bodies, data and scope. That
  is still specific, and it is the programme's own wording. Choosing the "best finding" sentence
  from 30,000-character logs is a judgement per programme, not a rule.
- The boilerplate list is two literal patterns for the openers actually in use. A broader
  heuristic would drop real content.

## Still weakest, and what I would do next

1. **The registry summaries are uneven.** cell-fidelity's opens with "Milestone 5zb (kinetic
   law): ...", and 1,080 cards run 180 to 30,000 characters. A short `lede` field on each
   programme card (written by its research runs) would beat any extraction. Raise it in
   `research/CLAUDE.md` as a suggestion.
2. **Tool project pages still have the generic dek** (`polish-2026-11-16-project-pages.md`,
   item 3). The venture's `llms.txt` `>` summary line, or its marketing page's meta description,
   is the obvious source.
3. Carried over: 401 research posts name no programme; the 1,280 px "By programme" block is 363 px;
   the hub's empty right half at 1,280 px.
