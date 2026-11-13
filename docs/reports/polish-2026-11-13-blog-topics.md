---
kind: polish
date: 2026-11-13
tagged: auto
---
# Polish 2026-11-13: blog topics follow the project, search-result cards match the list

**Why.** The previous report's "still weakest" items were taken (#15399 has the last intro link
walls) or editorial. So I did the survey the prompt asks for: full local build of main, served with
`python3 -m http.server`, pre-installed Chromium, third-party requests blocked, reduced motion, 390
and 1,280 px, on the hub, ai-bookkeeper, `/research/`, `/stories/`, `/writing/` and one post. No page
scrolled sideways. The weakest thing a visitor sees was on the blog index (4,042 posts): the first two
cards, a pre-registered battery-model test and a construction-robot result, both wore the
"Tools and projects" pill.

## What was wrong

1. **Topics.** `topicOf()` (`platform/pages/writing.mjs`) made a post a research finding only when a
   tag was literally `research`. Research posts usually tag their project (`marine-hull`,
   `aerolog-scaling`) and fell through to the default, "Tools and projects". 110 posts, from 19
   projects (aerolog-scaling 17, marine-hull 17, cell-fidelity 12, verified-dse 10,
   buildbot-sheathing 9, heavy-hydraulics 9, ...).
2. **Search-result cards** are built in the browser (`card()` in the index script) and showed
   `Tools and projects · 2026-11-10 · 1 min read` as plain text: no pill, ISO date. The list's own
   cards show a pill and "10 November 2026".
3. **List card meta**: date and reading time were each a grey pill; at 390 px "3 min read" wrapped
   alone onto a third line.
4. **Post header**: at 390 px "Source" wrapped alone after a dangling " · ".

## What changed

1. `projectSlugs(root)`: folder names under `research/` (with README.md) and `ventures/` (with
   index.html or README.md). `loadPosts` passes them to `topicOf(tags, explicit, projects)`: a
   research slug tag means research (after start-here, quality-audit, opinion); a venture slug tag
   means tools, ahead of the infrastructure and agents tag lists. Without `projects` the old
   behaviour stands. The 1,077 research and 1,352 venture slugs share no name.
2. Two process posts about Hearth & Horizon's README would have moved to Tools; they now carry
   `topic: agents`.
3. Card meta: `<span class="topic">` + `<span class="when">date · N min read</span>` (nowrap), in
   both `renderIndex` and the browser `card()`, which formats the long date the same way
   (`en-GB`, UTC).
4. Post header: `N&nbsp;min&nbsp;read&nbsp;·&nbsp;Source`.
5. `writing.test.mjs`: a test for the project rule, `projectSlugs` on a temp repo and on the real one.

## Numbers

| topic (4,042 posts) | before | after |
|---|---|---|
| Research findings | 745 | 855 |
| Tools and projects | 2,970 | 2,869 |
| Building with AI agents | 165 | 159 |
| Hosting and infrastructure | 40 | 37 |
| Quality audits, Start here | 79, 43 | 79, 43 |

Moves other than tools to research: 3 infrastructure to tools (changepoint-detector CLI setting,
two actions-continue-on-error-check posts), 6 agents to tools (sales-agent brief, two form fixes,
three Hearth & Horizon stories tagged `ai-agents`). Read by eye; each names a venture.

`node platform/pages/check.mjs` on the new build: "looks publishable: 1346 products, 45 category
pages, 9124 pages, no dead links". `node --test 'platform/pages/*.test.mjs'`: see the run record.

Screenshots: [cards 390 before](img/polish-2026-11-13-blog-cards-390-before.png) ·
[after](img/polish-2026-11-13-blog-cards-390-after.png) ·
[cards 1280 before](img/polish-2026-11-13-blog-cards-1280-before.png) ·
[after](img/polish-2026-11-13-blog-cards-1280-after.png) ·
[search result 390 before](img/polish-2026-11-13-blog-search-390-before.png) ·
[after](img/polish-2026-11-13-blog-search-390-after.png).

## Still weakest, and what I would do next

1. **~580 "Tools and projects" posts name no project** (top tags: open-source 186, testing 119,
   construction 68, seo 66, ci 60, redteam 51, polish 43, accessibility 42, performance 36). Many are
   about the site, CI or the red-team track, not a tool. Either widen the infrastructure/agents tag
   lists (and the "Hosting and infrastructure" blurb to cover site design) or set `topic:` post by
   post. Measure with a loop over `loadPosts()` as in this report.
2. **The blog filter row** at 390 px: "Tag" label stacked above a full-width select, "Sort" inline
   beside a short one, both native selects about 28 px tall under a 44 px search box. One consistent
   control row (shared input height, labels the same way) would read as designed.
3. Carried over: the shared `.jump` component (five copies, nine once #15399 lands); topic-page
   titles four lines on phones; `.pager` defined twice in the writing STYLE; ai-bookkeeper lede and
   `#guides` length on a phone.
