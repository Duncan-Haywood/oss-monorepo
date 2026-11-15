---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: research topic and project pages lose the duplicate "← All projects" bar

Track: polish/0. Picked from `polish-2026-11-15-crumb-echo.md`, "Still weakest" item 2 (the space
above a project's `h1` at 390 px repeats the trail). Looking at the page, the bigger repeat was not
the eyebrow but the row above it. Searched open PRs (all 60 open): none touch `research/_homepage`.

## What was wrong

`with_site_chrome(..., replace_topbar=False)` put the site header above each topic and project
page's own `<header class="topbar">` and kept that bar as a sub-nav: `← All projects | GitHub`
(project) and `← All research topics | GitHub` (topic). 56 px, on 1,111 pages. The trail already
links Research and the topic; "All projects" went to the research index, which lists topics, not
projects; "GitHub" went to the repository root.

## What changed

- `research/_homepage/build.py`: topic and project pages call `with_site_chrome` with
  `replace_topbar=True`, like the index. Docstring records why.
- `research/_homepage/project.html`: the standalone bar (no site chrome) reads "← All research" and
  its GitHub link goes to `tree/main/research/<slug>`.
- `platform/ci/test_research_homepage_publish.py`: `ResearchSiteChromeTest` builds with a stub
  chrome JSON (one header on every page, no `topbar`) and without (the bar's label and link). The
  file's `__main__` block was mid-file, so `python3 <file>` ran 6 of 15 tests; moved to the end
  (17 run, all pass).

The eyebrow (`.theme-tag`, the topic in caps with its colour square) stays: it's a link, it carries
the topic colour, and with the bar gone the h1 is already 56 px higher. Dropping it on a phone would
save another ~28 px if a later run wants it.

## Measured

Research builder with `writeResearchChrome` output and `renderSiteStyle()`, served over HTTP,
Playwright Chromium, reduced motion:

| | 390 before | 390 after | 1,280 before | 1,280 after |
|---|---|---|---|---|
| `h1` top, abstention-scoring | 236 | 180 | 213 | 157 |
| `h1` top, accel-codesign | 236 | 180 | 232 | 176 |
| `h1` top, topics/accel | 231 | 174 | 209 | 152 |
| `scrollWidth` > viewport | no | no | no | no |

Screenshots: `docs/reports/img/polish-research-bar-{before,after}-{abstention-scoring,topic-accel}-390.png`.

## Still weakest, and what I would do next

1. **The project page's `.slug` line** (`research/abstention-scoring`, mono, under the h1) is
   developer-facing; a reader sees it before the result. Could move into the "Links" block or the
   stats row as "12 tests · research/abstention-scoring".
2. **The `.topbar` CSS** in `project.html`/`topic.html` is now dead on the published site but still
   used standalone; fine, but `template.html` has a different topbar again. One shared template
   partial would stop the three drifting.
3. Carried over: tool pages `echo` crumb (crumb-echo item 1); "by project" index on
   `writing/topic/tools/`; podcast chip-row edge fade; `cardName` vs `toolName`.
