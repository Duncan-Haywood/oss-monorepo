---
kind: polish
topics: [seo, design]
date: 2026-11-16
---
# Polish 2026-11-16: a page per project under "Tools and projects"

Track: polish/0. Picked from the "Still weakest" lists of `polish-2026-11-15-topic-pages.md`
(item 1) and `polish-2026-11-15-windowed-pager.md` (item 1): "Tools and projects is still about
half the blog; a by-project index would beat a 51-page date list". Carried over three reports.
Open PRs searched: #16405 (the column rule, item 2 of `polish-2026-11-16-story-cards.md`) is the
only open polish PR; nothing touched topic pages.

## What was wrong

`writing/topic/tools/` was 2,595 posts by date over 52 pages. Measured on 2026-11-16: 2,186 of
them (84%) carry a tag naming a `ventures/` folder; 17 ventures have 3 or more posts, 14 have 21 or
more (Wall Framing Takeoff 477, AI Bookkeeper 423, E-invoice preflight 216, ...). 409 name no
venture. A reader of one tool had no page that listed that tool's posts.

## What changed (`platform/pages/writing.mjs`, one line in `build.mjs`)

- Posts carry `project`: the first tag naming a venture, for "Tools and projects" posts only
  (`projectOf`).
- `projectGroups` (≥ `PROJECT_MIN_POSTS` = 3), `projectName` (README's first heading, cut at
  `: ` or ` — `; the slug if none).
- `renderProjectPage`: `writing/topic/tools/<slug>/` and `…/page/<n>/` (`noindex`). Title
  "<Name>: how it was built, post by post", description with the count, `CollectionPage` +
  `ItemList`, `about: SoftwareApplication` when the tool is served, 4-level breadcrumb. Hero links
  "Open <Name>" when `published` (build.mjs passes the surface slugs) has the slug.
- `renderProjectNav`: "By project" chips at the top of the topic's first page (class `lead`),
  "Other projects" at the foot of each project page. Under 640 px the lead row is one sideways
  row with a CSS-only right-edge mask and 40 px end padding so the last chip clears the fade.
- Post pages of grouped projects add "More on <Name>" beside "More in Tools and projects".
- The 17 first pages are returned for the sitemap.
- Standalone `node platform/pages/writing.mjs --out=<dist>` links tools already in that dist.
- Tests: `writing.test.mjs`, two new tests (grouping, names, links, sitemap, structured data,
  phone row).

## Measured

Section build over a full build's `dist`, served by `python3 -m http.server`, Playwright 390×900
and 1280×900, deviceScaleFactor 1.

| | before | after |
|---|---|---|
| Pages listing one project's posts | 0 | 17 (+ 66 `noindex` numbered) |
| Sitemap URLs under `writing/topic/tools/` | 1 | 18 |
| Post pages linking their project page | 0 | 2,186 |
| "By project" block height, 390 px | n/a | 153 px (545 px before the sideways row) |
| First card top, topic page, 390 px | 421 px | 601 px |
| First card top, topic page, 1,280 px | 410 px | 742 px |
| Sideways scroll (topic, project, project page 2; both widths) | none | none |
| `h1` per page | 1 | 1 |

The first card moves down by the block's height: the price of putting the project index first.
At 1,280 px the 17 chips wrap to five rows; that is the page's main navigation now, so it stays.

Screenshots: `docs/reports/img/polish-project-before-tools-{390,1280}.png`,
`polish-project-after-tools-{390,1280}.png`, `polish-project-after-wall-framing-takeoff-{390,1280}.png`.

## Still weakest, and what I would do next

1. **Research findings is the next big date list** (check its count): the same grouping by
   `research/` project would give each programme a findings page. `projectOf` only reads
   ventures today; extend it with `projects.research` and a `research` topic branch.
2. **409 "Tools and projects" posts name no venture.** Many name a tool by a tag that is not its
   folder name (e.g. a calculator slug published from `ventures/calculators`). A tag alias map, or
   reading the published surface slugs, would group more of them.
3. **The project pages have no lede beyond a generic sentence.** The README's first paragraph or
   the venture's `llms.txt` summary would make each page say what the tool is.
4. Carried over: the hub's empty right half at 1,280 px; the podcast row's edge fade.
