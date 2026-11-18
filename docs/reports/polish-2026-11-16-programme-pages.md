---
kind: polish
topics: [seo, design]
date: 2026-11-16
---
# Polish, 2026-11-16: a findings page per research programme

Track: polish/0. Picked from item 1 of "Still weakest" in `polish-2026-11-16-project-pages.md`
("Research findings is the next big date list"). Open PRs searched: no open polish PR touches
`platform/pages/writing.mjs`.

## Measured (built site, `node platform/pages/writing.mjs --out=dist`)

- `writing/topic/research/` before: 1,117 posts, 23 pages, no grouping.
- 716 of them (64%) carry a tag naming a `research/` folder. 36 programmes are named, and 24 have
  3 or more posts (`PROJECT_MIN_POSTS`). Top: marine-hull 121, verified-dse 80,
  aerolog-scaling 70, llm-coding-inference 67, build-data 66, heavy-hydraulics 38.
- 401 name no programme. Their commonest other tags are `statistics` 57, `robotics` 53,
  `hydraulics` 47, `heavy-equipment` 44 and `load-sensing` 38.
- The "By programme" nav (Playwright): 153 px at 390 (one sideways row), 363 px at 1,280 (7
  wrapped rows). The first post's top moves from below the hero to 601 / 800 px. `scrollWidth`
  equals the viewport at both widths.
- All 24 "Read the <slug> programme" links resolve to `dist/research/<slug>/index.html`.

Screenshots: `img/polish-2026-11-16-programmes-topic-{before,after}-d.png` (1,280),
`img/polish-2026-11-16-programme-page-390.png`.

## What changed (`platform/pages/writing.mjs`)

- `projectOf` reads `PROJECT_TOPICS` (`tools` → ventures, `research` → research folders).
- `projectGroups` takes `topic` and `questions`. A research group is
  `{ slug, name: slug, count, topic: 'research', question }`.
- `researchQuestions(root)` reads the research registry (`research-registry.mjs`, the same merge
  the research site builds from) and strips HTML from card titles. A programme in the registry
  has a page, so it gets the hero link `research/<slug>/`.
- `renderProjectPage` branches on `project.topic`. For research: the eyebrow is "Research
  programme · <slug>", the `h1` is the question, the title is `<slug> findings: <question>`,
  `about` is `ResearchProject`, and the nav heading is "Other programmes".
- `renderProjectNav` puts a `title` tooltip with the question on research chips and says
  "programmes". The topic page heading is "By programme".
- Post pages: "More on <slug>" now uses the post's topic in the path.
- `writeSection` and `buildWriting` build the groups per topic, and the sitemap gets
  `topic/<topic>/<slug>`.
- New test in `writing.test.mjs`: a research programme gets its page, sitemap entry, question
  heading, programme link and post link, and research and tools groups stay out of each other's
  pages.

## Choices

- Chips show the slug, not the question. The questions run 60 to 190 characters, so as chips they
  would turn the row into a 24-line list. The question shows in the tooltip and as the page's
  `h1`.

## Still weakest, and what I would do next

1. **401 research posts name no programme.** Many are track-level posts (`research`,
   `statistics`). A tag alias map (`hydraulics`/`excavator` → `heavy-hydraulics`) needs a human
   judgement per tag. Check a sample before mapping, because a wrong alias misfiles findings.
2. **Programme pages have a generic dek.** The registry card's `summary` (HTML abstract) or the
   README bullet lede would make the dek say what was found. The same applies to tool pages
   (`polish-2026-11-16-project-pages.md`, item 3).
3. **The 1,280 px By programme block is 363 px.** For the 7 smallest programmes, a "more" fold
   or a smaller type size would get the first post above the fold.
4. Carried over: the hub's empty right half at 1,280 px; the 409 tool posts that name no venture;
   other pages' `.wrap` columns (index-column report, item 2).
