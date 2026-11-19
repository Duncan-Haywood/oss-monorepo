---
kind: polish
topics: [seo, browser]
date: 2026-11-19
---
# Polish: repaired links go to the site's research page and name oss-monorepo; /ask/ check fetches its links

Date: 2026-11-19. Track: polish/0. PR #17734. `polish_queue.py` showed 67 open items, none
claimed, and no open polish PR. I took items 1 and 2 of `polish-2026-11-19-hub-links.md`, then the
/ask/ example-question browser check that four reports carried over.

**Duplicate work.** PR #17735 (`ask-suggestions-check.mjs`) landed that same /ask/ check while
this PR was in CI. It also has per-question expectations and a ranking fix. I deleted my
`ask-check.mjs` and folded in the one thing it did that #17735's doesn't: fetching every link in
a reply and failing on one that doesn't load. Both runs read the queue before either draft PR
existed, which is the same race `polish-2026-11-18-homeowners-retirees-320.md` item 4 describes.

## 1. Repaired links (`repairLinks`, `platform/pages/build.mjs`)

**Measured on a full build of main** (before): the build repaired 6 links on 4 pages, all to
`github.com/Duncan-Haywood/monorepo-projects/blob/main/...`:

| from | to (before) |
|---|---|
| wall-condensation-check index + guide | `blob/main/research/house-dewpoint` (a folder, via `blob/`) |
| stranded-branch-finder (2) | `.../ventures/stranded-branch-finder/stranded.py` |
| chant-forge (2) | its README.md and RECORDING-GUIDE.md |

**Changed:**

- `sitePageForRepoPath`: a repair whose target is `research/<slug>/` or its README goes to
  `/research/<slug>/` when the site builds that page. A file inside the project still goes to
  GitHub, because that is what the link means.
- `buildSiteInner` awaits the research build before pass 2a, so the page exists when the
  repair asks. Pass 1 takes minutes and the research build about 2 s.
- `SOURCE_URL_PREFIX` is `${REPO_WEB_URL}/blob/main/` (`oss-monorepo`). Folders use
  `SOURCE_TREE_PREFIX` (`tree/`). The Python mirror in `platform/ci/build_pages_site.py` does the
  same.
- Each repair now records `to` and `repoPath`. The build test "no link to a published venture is
  repaired out to the private repository" reads that list. It used to grep the built HTML for
  the prefix, and with the new name it matched the hand-written `oss-monorepo` source links in
  posts, which aren't repairs.

**After (second full build):** both wall-condensation-check links are `../research/house-dewpoint/`.
The other 4 name `oss-monorepo`. `check.mjs`: 12,006 pages, no dead links.

**Found while counting:** 42 venture pages had `monorepo-projects` typed in by hand in their
"source" links, and einvoice-preflight's SARIF `informationUri` did too. I fixed them with one
`sed`. `repo-name.test.mjs` fails if a venture page uses the old name again. I left two research
reproducibility scripts and 12 historical `.md` files alone, because they are records.

## 2. Dead links in /ask/ replies (`ask-suggestions.mjs`, `ask-suggestions-check.mjs`)

`judgeReply` reports each href in `reply.dead`. The checker fetches every link in a reply. A
new unit test covers this. On a build with `dist/roofing-bid-calculator/` moved aside, the
checker fails with `links /roofing-bid-calculator/how-to-price-a-roof-by-the-square.html, which
does not load`. Before this change, that reply still matched `/roof/` and passed.

## Still weakest, and what I would do next

1. **The build logs only a count of repairs** ("Repointed 6 off-site link(s)"). Writing the
   list (`repairs` now has `to`) into the build report would show a run what goes off-site
   without grepping 12,000 pages.
2. **deploy-concurrency-check-ci is red on main.** Its dogfood step (`check.py .github/workflows/
   --fail-on-risk`) finds 11 risks in the repository's own workflows: split concurrency groups
   for `paid-agents`, and `cancel-in-progress` on a deploying job in `uitest-ci.yml`. Any PR that
   touches that venture shows the red. The fix is a control-plane PR.
3. **Register the browser checks.** fold-check, ask-suggestions-check and four others wait in
   `pending` for one control-plane PR (`browser-checks-ci.yml`).
4. Carried over: per-request share cards (`request-page-figure` #1), `/engineering/` pinned row
   names (`pinned-row-names` #2).
