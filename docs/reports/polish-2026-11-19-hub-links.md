---
kind: polish
topics: [hosting, design]
date: 2026-11-19
---
# Polish: "More free tools" opened a GitHub folder on 12 pages

Date: 2026-11-19. Track: polish/0. Not from the polish queue: found by screenshotting flagships
(IDS Model Check at 390 px showed two breadcrumbs stacked) and following the second one.

## What was wrong (measured on a full build of main)

`repairLinks` (`platform/pages/build.mjs`) repoints a venture link that leaves the site at the
file in the repository. It decides "inside the site" by whether the target exists on disk. The
hub, `dist/index.html`, is written after every surface's repairs, so a venture's `href="../"`
always looked like it left the site and became
`https://github.com/Duncan-Haywood/monorepo-projects/blob/main/ventures`.

14 built pages carried that link:

- 11 "More free tools" footers: sprinkler-hydraulic-calc, job-shop-scheduler (+ how-it-works),
  water-supply-sizing (+ how-it-works), texas-electricity-plan-checker, assembly-line-balancer
  (+ how-it-works), hvac-load-calc (+ ducts), elevator-traffic-analysis.
- 3 "All tools": ids-model-check index and editor (as a page-local breadcrumb that also
  repeated the site trail word for word), submittal-register.

This is the same mistake as the sibling-venture case the build test
"no link to a published venture is repaired out to the private repository" covers, with the hub
as the target instead of a venture. That test only looks under `ventures/<slug>`, so it missed
the bare folder.

## What changed

- `repairLinks` leaves a link alone when it resolves to `outDir/index.html` (the hub is always
  built).
- `build.test.mjs`: "a venture link to ../ stays the hub, not the repository folder", isolated
  like the unpublished-file case. Fails on main, passes with the fix.
- `ventures/ids-model-check/{index,editor}.html`: dropped the page-local "All tools / …"
  breadcrumb; the site trail above it already says Home › Trade & contractor bids › IDS Model
  Check (› IDS Editor). Saves one line above the h1 on a phone.

Verification is in the run record's `notes` (second full build: count of `blob/main/ventures"`
links after the fix).

## Still weakest, and what I would do next

1. **Research links repaired to GitHub when the site has the page.** One found:
   wall-condensation-check (index and guide) links "research behind this tool" to
   `blob/main/research/house-dewpoint`, while `/research/house-dewpoint/` is on the site. A
   general fix maps `research/<x>` repairs to the site's research page when it is built. Check
   the whole repaired-link list (the build report) for other live targets first.
2. **The repaired links still use the old repository name** (`monorepo-projects`).
   GitHub redirects renamed repos, but `SOURCE_URL_PREFIX` could name `oss-monorepo`.
3. Queue items carried over: `/ask/` example-question browser check; per-request share cards.
