# Internal Link Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/internal-link-planner/>

After using this, you can **see which pages of your site nobody links to, which sentence on which existing page should link to each of them, and how much internal link equity the plan moves**, without a $77/year plugin or a desktop crawler licence.

Open `index.html`, pick your site's build folder (or a handful of `.html` files) and press Analyze. The page reads the files locally and makes no network requests. The same engine runs as a command line tool for CI and for live sites.

## Why use this instead of what you have today

| Today | Problem | Internal Link Planner |
|---|---|---|
| Link Whisper (WordPress plugin, paid per year) | WordPress only; suggestions live inside the CMS | Any site that produces HTML: Astro, Next export, Hugo, Jekyll, Eleventy, plain files |
| Screaming Frog, Sitebulb, Ahrefs Site Audit | Crawlers that list orphans and inlink counts; the "what to link" step is yours | Names the phrase already in the text, the page to put it on, and the target |
| Doing it by hand | Nobody remembers 300 articles | TF-IDF similarity finds the pages that already talk about the topic |
| Not doing it | New posts sit as orphans | Run it in CI after each build and read the diff |

It is a planner, not a crawler: it works on the pages you give it, offline, in seconds. Use a crawler to discover pages on a site you cannot build locally.

## What it reports

- **Orphans:** indexable pages with no incoming internal link.
- **Menu-only pages:** linked from navigation, headers, footers or sidebars but never from page text.
- **Deep pages:** more than three clicks from the home page.
- **Dead ends:** pages with no internal link in their text.
- **Links to pages not in the set:** broken links, or pages missing from the crawl.
- **Suggested links:** for pages that need links (the ones you name with `--priority`, plus the least-linked substantial pages), every other page that already contains the target's headline, title or slug words (singular or plural) and does not link to it, with the sentence around the match, ranked by score.
- **Effect:** PageRank before and after applying the whole plan.

## Model, stated plainly

- A page's identity is its URL with the hash, tracking parameters (`utm_*`, `fbclid`, `gclid`), `index.html` and the trailing slash removed.
- Link weight: body link 1, link inside `nav`/`header`/`footer`/`aside` 0.25, `nofollow`/`ugc`/`sponsored` 0. A page linking twice to another counts once at its best weight.
- PageRank: damping 0.85, power iteration to 1e-10, dangling pages share their mass evenly, scaled so the average page is 1.00.
- Suggestion score: 0.60 x TF-IDF cosine between the two pages, 0.25 x the source's rank divided by its outgoing links (capped at 1), 0.15 x phrase specificity (three-word phrases beat one-word ones). At most 3 new links per source page and 5 per target by default.
- `noindex` pages are left out of the graph.

**Not modelled:** links added by JavaScript, canonical tags that point elsewhere, `robots.txt`, redirects, anchor text as a search engine reads it, and crawl budget. The effect table is internal link equity under this simplified model. It is not a ranking or traffic forecast, and nothing here predicts either.

## Command line

```
node cli.mjs ./public --base https://example.com --priority /pricing,/blog/best-guide
node cli.mjs https://example.com/sitemap.xml --max 300 --json
```

A folder is read from disk and needs `--base`. A sitemap URL is fetched 4 pages at a time with a 100 ms pause, only for URLs on the sitemap's own host; point it at sites you own. Node 18 or newer, no dependencies.

## Test

```
node --test
```

The suite builds a synthetic site with a known orphan, a menu-only page, a dead end and a broken link, checks the anchor text really appears in the source page, checks the plan raises the target's rank, and times a 2,000-page site.

## Self-deploy

There is nothing to host: the page is static (`index.html` plus three modules), so any static host works. Fork the repository and enable GitHub Pages, or upload the directory to any bucket.

## Disclaimer

No warranty. Not legal, tax, accounting, compliance or financial advice, and no promise about search rankings or traffic. Not affiliated with any search engine or platform. MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood
