---
kind: polish
topics: [design, seo]
date: 2026-11-15
---
# Polish 2026-11-15: "Site design and SEO" and "Testing and red team" blog topics

Track: polish/0. Started from `polish-2026-11-15-blog-stories-topic.md`, "Still weakest" item 1
(Tools and projects was 61% of the blog). Searched open PRs for `polish`, `topic`, `blog`: none.

## Measured

Tag census over `loadPosts()` (4,707 posts), counting posts that land in `tools` with no
`ventures/` tag: 656. Top tags among them: open-source 194, testing 166, redteam 81, ci 75,
seo 71, polish 57, mutation-testing 52, performance 49, accessibility 48. Then per tag, where
all posts carrying it land, and how many name a venture (`redteam` 130, 45 with a venture;
`seo` 108, 21; `performance` 132, 58; `testing` 577, 286).

## Changed (`platform/pages/writing.mjs`)

- Topics `site` ("Site design and SEO") and `testing` ("Testing and red team"), before
  infrastructure in the chip row.
- Strong tags, checked after research and before the venture rule: `TESTING_TAGS` (redteam,
  red-team, mutation-testing, fault-injection), `SITE_TAGS` (polish, seo, aeo, llms-txt).
- Loose tags, checked only after the agents rule (where the old default sat):
  `TESTING_LOOSE_TAGS` (testing, ...), `SITE_LOOSE_TAGS` (accessibility, design, css, site, ...),
  `PLUMBING_LOOSE_TAGS` (ci, build, caching → infrastructure). `performance` deliberately not
  included: 58 of its posts are about making one tool faster.
- `docs/posts/2026-11-05-401k-loan-or-withdrawal...`: `topic: tools` (reader-facing explainer
  tagged polish/seo).
- Tests: `writing.test.mjs`, "site craft and test campaigns leave Tools and projects".

Built chip counts (full local build, dist/writing/): Tools 2,876 → 2,462; Testing 223; Site 193;
Agents 195 → 181 (14 SEO/redteam posts that also carried `ai-agents`/`process`); Infrastructure
43 → 55. `scrollWidth` 390 at 390 px and 1,280 at 1,280 px. New podcast feeds
`writing/podcast/site/` and `testing/`, one episode each.

## Still weakest, and what I would do next

1. **The topic chips wrap to six rows on a 390 px phone** (nine topics plus All): about
   250 px of chips before the tag/sort controls. A single horizontally scrolling row with a
   fade edge, or a `<select>` under 600 px, would give the first post back its place. Keep
   `aria-pressed` and keyboard order.
2. **Tools and projects is still 2,462 (52%).** The remaining no-venture posts are mostly
   tagged by subject (`construction`, `music`, `bookkeeping`, `gregorian-chant`): they are
   about tools whose slug the post did not tag. A pass adding the venture slug where the post
   names one would not change their topic, but would sharpen related posts and tag pages.
3. Carried over: crawlable topic pages (`writing/topic/<id>/`); answer leads on ~22 tools;
   149 cut selects at 1,280 px; quote-margin-check dark-mode leftovers.
