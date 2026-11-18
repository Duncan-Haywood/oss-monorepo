---
kind: polish
topics: [design, seo]
date: 2026-11-15
---
# Polish 2026-11-15: a Stories topic on the blog (415 posts out of "Tools and projects")

Track: polish/0. Started from `polish-2026-11-14-sticky-contrast.md`, "Still weakest" item 1
(`scrollable-region-focusable` on `.pf-table-scroll`). That item no longer reproduces (below), so
I screenshotted the hub, the top flagship (wall-framing-takeoff), research, stories, the blog
index and a recent post at 390 and 1,280 px and took the weakest thing a visitor sees: a
bedtime story's topic badge reading "Tools and projects". Searched open PRs for `polish`,
`stories`, `topic`; none touched it.

## What was wrong

`platform/pages/writing.mjs` `topicOf()` gives every post one topic from its tags. A tag naming
a `ventures/` folder means Tools, and the story shelves (`hearth-and-horizon`,
`saints-by-candlelight`) are ventures. Fiction tagged only `fiction` matched no rule and fell
through to the default, Tools as well. So 409 stories sat under Tools and 10 under "Building
with AI agents" (For Other Minds, fiction about agents). Tools held 3,253 of 4,654 posts.

It is the blog's half of `polish-2026-11-11` (436 story pages' header and breadcrumb said Tools).

## What changed

- New topic `stories` ("Stories") in `TOPICS`, placed after Tools in the chip row.
- Rule (after `opinion`, before research): a fiction tag (`fiction`, `science-fiction`,
  `short-story`, `bedtime-story`) or a shelf name (the four shelves) → stories, **unless** the
  post carries a process or hosting tag (`BACKSTAGE_TAGS`). That keeps the four posts about
  running a shelf (the to-do list, the audio cap, the story queue, the list nobody could keep)
  where they were. `ai-agents` is deliberately not a veto: For Other Minds stories carry it.
- Tests in `writing.test.mjs`.

| topic | before | after |
|---|---|---|
| Tools and projects | 3,253 | 2,846 |
| Building with AI agents | 199 | 191 |
| Stories | 0 | 415 |

Side effects, checked on a full build: each story's `articleSection` JSON-LD now says
Stories; related posts under a story draw from stories first; the podcast writes a new
`writing/podcast/stories/feed.xml` with three Hearth & Horizon episodes, which leave
`podcast/tools/feed.xml` (the all-episodes feed is unchanged). No other podcast feed changed.

## The table-scroll finding did not reproduce

On today's build, at 390 px, `SCROLL_A11Y_SCRIPT` (build.mjs) gives every overflowing box on
dupehound, the home-elevator guide and terraform-plan-cost-estimate `vs-infracost` a
`tabindex="0"` (the `.pfs-nav` strip and dupehound's `pre.cmd`; no `.pf-table-scroll` box
overflows at that width). axe-core 4.10.2's `scrollable-region-focusable`, run on all three at
320 and 390 px in light and dark, reported **0 violations**. Leave that item closed unless a
full `contrast.mjs` run names a node again; if it does, record the node's selector.

## Still weakest, and what I would do next

1. **Tools and projects is still 61% of the blog (2,846 of 4,654).** About 620 of those
   name no venture: posts tagged `redteam`, `mutation-testing`, `ci`, `polish`, `seo`, `aeo`,
   `accessibility`, `performance`. They are about how the site and fleet are built and
   checked. A "Site and quality" topic, or `ci`/`polish`/`seo` folded into existing ones,
   would make the chip mean something. Check per tag: `performance` is also used by
   algorithm posts about a single tool.
2. A topic page per topic (`writing/topic/<id>/`) with its own title and description would
   give search engines a crawlable URL for "AI-written bedtime stories of the saints". Today
   the filter is a query string that the static page reads in JavaScript.
3. Carried over: answer leads on ~22 tools; 149 cut selects at 1,280 px
   (`polish-2026-11-14-select-track.md`); dark-mode leftovers on quote-margin-check
   (`polish-2026-11-14-sticky-contrast.md` item 2).
