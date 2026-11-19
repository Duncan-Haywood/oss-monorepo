---
kind: polish
topics: [seo, software-for-routine, browser]
date: 2026-11-19
---
# Polish: a check that taps /ask/'s example questions; repaired links stay on the site and name oss-monorepo

Date: 2026-11-19. Track: polish/0. PR #17734. `polish_queue.py` showed 67 open items, none
claimed, and no open polish PR. I took two:

- items 1 and 2 of `polish-2026-11-19-hub-links.md` (research links repaired to GitHub; the old
  repository name in repaired links);
- the /ask/ example-question browser check, carried over in four reports
  (`ask-page` #2, `stacked-tables` #4, `phone-table-cells` #4, `hub-links` #3).

I opened the draft PR before the second build to claim them.

## 1. Repaired links (`repairLinks`, `platform/pages/build.mjs`)

**Measured on a full build of main** (before the change): the build repaired only 6 links on
4 pages, all to `github.com/Duncan-Haywood/monorepo-projects/blob/main/...`:

| from | to (before) |
|---|---|
| wall-condensation-check index + guide | `blob/main/research/house-dewpoint` (a folder, via `blob/`) |
| stranded-branch-finder (2) | `.../ventures/stranded-branch-finder/stranded.py` |
| chant-forge (2) | its README.md and RECORDING-GUIDE.md |

**Changed:**

- `sitePageForRepoPath`: a repair whose target is `research/<slug>/` or its README goes to
  `/research/<slug>/` when the site builds that page. A file inside the project still goes
  to GitHub, because the link means that file.
- `buildSiteInner` awaits the research build before pass 2a, so the page exists when the
  repair asks. Pass 1 takes minutes and the research build about 2 s, so this costs nothing.
- `SOURCE_URL_PREFIX` is now `${REPO_WEB_URL}/blob/main/` (`oss-monorepo`), and folders get
  `SOURCE_TREE_PREFIX` (`tree/`). The Python mirror in `platform/ci/build_pages_site.py` does
  the same.

**After (second full build):** both wall-condensation-check links are `../research/house-dewpoint/`.
The other 4 repairs name `oss-monorepo`. `check.mjs` reports 12,006 pages and no dead links.

**Found while counting:** 42 published pages (41 venture `index.html` "source" links plus
`vs-vibeappscanner` and `vs-mxtoolbox`) had `monorepo-projects` typed in by hand. Every link
paid a redirect, and the redirect lasts only while nobody claims the old name. I fixed them in
the source with one `sed`, plus einvoice-preflight's SARIF `informationUri`.
`repo-name.test.mjs` fails if a venture page uses the old name again. I did not change two
research reproducibility scripts (`marriage-divorce-evidence`) or 12 historical `.md` files:
they are records, not pages.

## 2. `ask-check.mjs` + `ask-examples.mjs`

/ask/ is the 2nd most loaded page (`portfolio/usage/site-visits.json`). Its three example
questions are the first answer a visitor sees. The check opens the built /ask/ at 390×844 and
taps each button with the default rule-based engine, reloading between taps because asking
removes the row. It exits 1 when:

- the reply is "I found nothing", or there is no reply;
- the reply has neither a "From this page:" passage nor a tool;
- a "Which/What tool …" question lists no tool;
- any listed tool page does not load (each link is fetched).

It takes about 2 s on a built dist. Same `DIST`/`BASE_URL` contract as `fold-check.mjs`.
`--all` prints each reply.

**Verified both ways:**

- On the build: exit 0. Roofing → 5 links (trade-bid hub, for-roofers, roofing guide, two
  comparisons). eBay → Where to Sell plus 4 fee guides. Device → the FAQ passage.
- Example 1 replaced in `dist/ask/index.html` with "zxqv plorbt wuggle?": exit 1,
  `answered "I found nothing"`.
- `dist/roofing-bid-calculator/` moved aside: exit 1, `links
  /roofing-bid-calculator/how-to-price-a-roof-by-the-square.html, which does not load`.

The rule has 6 unit tests in `ask-examples.test.mjs`. `test_browser_checks.py` lists
`ask-check` in `pending` beside `fold-check` (registering it edits a control-plane workflow).

## Still weakest, and what I would do next

1. **The privacy example's "Related tools" are noise.** "Does what I type leave my device?"
   quotes the right FAQ answer, then lists five unrelated guides ("Where does the sleeve end",
   semver prereleases, SMS segments). When `bestPassage` answers from the page, the rules
   engine could drop tools whose search score is weak, or show none. Measure on a few tool
   pages first: the floating panel uses the same code.
2. **The roofing example's first link is the estimate-maker hub, not the roofing calculator.**
   `/roofing-bid-calculator/` itself is not in the five. That is a search-ranking question in
   `searchSite`; a visitor asking "which tool" should see the tool first.
3. **Register the browser checks.** fold-check, ask-check and four others now wait in `pending`
   for one control-plane PR (`browser-checks-ci.yml`).
4. Carried over: per-request share cards (`request-page-figure` #1), `/engineering/` pinned row
   names (`pinned-row-names` #2).
