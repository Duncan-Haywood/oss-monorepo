---
kind: polish
topics: [seo, content]
date: 2026-11-11
---
# Polish 2026-11-11: /guides/ lists only guides (1,636 to 1,161 pages)

## Why this item

Item 1 of "Still weakest" in `polish-2026-11-11-guides-render-cost.md`: /guides/ promised "how a
price is built up" from "free calculators", but `discoverGuides` took every extra page any product
shipped. A build of main (b2441dae) listed:

| product | pages | what they are |
|---|---|---|
| hearth-and-horizon | 348 | fiction (Stories section) |
| saints-by-candlelight | 97 | fiction (Stories section) |
| monastery-site | 21 | `demo/abbey/*`, `demo/sisters/*`: sample sites of a fictional abbey and convent |
| catholic-shorts | 8 | video pages, some labelled fiction |

## What changed

- `isGuidePage` (`platform/pages/build.mjs`) drops any path with a `demo/` or `demos/` segment.
- New `NOT_GUIDE_VENTURES` = `STORY_VENTURES` keys + `catholic-shorts` + `sed-contra`, skipped in
  `discoverGuides`. A new story shelf added to `STORY_VENTURES` is covered automatically. A new
  content (non-tool) venture is not: there is no "kind: content" field in `VENTURE.yaml` yet.
- Each tool block's note now reads "N pages beside the tool", not "beside the calculator", which
  was untrue for the apps and command-line tools the index also lists.
- Tests: `isGuidePage` and `discoverGuides` tests in `build.test.mjs` cover both rules.

Everything downstream reads `discoverGuides`, so the guides index, the audience pages' question
lists and the llms.txt guide count all changed together. The search index uses `collectGuidePages`
(a different reader) and still includes the stories, which is right for search.

## Measured (local build, 412 px Chromium)

| | before | after |
|---|---|---|
| guide pages | 1,636 | 1,161 |
| products | 610 | 605 |
| HTML | 1,110,431 B (224,638 gz) | 898,520 B (176,647 gz) |
| page height | 277,986 px | 220,798 px |
| Learning & practice block height | 55,311 px | 609 px |
| sideways scroll | no | no |

Screenshots: `img/polish-2026-11-11-guides-learning-before.png`, `…-after.png`.
All 453 removed story and video pages are still linked from their own shelf index pages (counted
in the build: 348/348, 97/97, 8/8). `check.mjs`: publishable, 8,609 pages, no dead links.
Guide tests (`--test-name-pattern guide`): 13/13.

## Still weakest, and what I would do next

1. **A `kind` for content ventures.** "Tool or content" is decided in three places by slug lists
   (`STORY_VENTURES`, the `learning` category test, `NOT_GUIDE_VENTURES`). One `VENTURE.yaml`
   field read by the build would replace all three.
2. **Other extra pages that are not guides.** Spot-check: `sales-agent`'s six pages are tools
   ("Free cold email checker"), not articles. Pages titled "Free … checker/calculator" are probably
   second entry points. A pass over labels starting "Free " would find them.
3. Carried over: `--min-a11y=100` and `heading-order.mjs` in nightly checks (control plane, own PR).
