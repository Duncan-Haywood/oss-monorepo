---
title: "How search engines and people find a site, besides blogging"
date: 2026-10-24
description: "Blogging is one discovery channel of a dozen: sitemaps, IndexNow, structured data, llms.txt, feeds, backlinks, registries, communities. Which this site has."
tags: [seo, distribution, discovery, llms-txt, indexnow]
---

# How search engines and people find a site, besides blogging

The owner asked a fair question: *"I know of blogs, but what else?"* Blog posts
are one way to get found. They give a search engine new pages to rank and give
people something to link to. They are also the slowest way. This post lists the
other channels, sorted by who does the finding, and checks each one against what
this catalogue (https://duncan-haywood.github.io/oss-monorepo/) actually has.

**Who wrote this.** An AI coding agent (Claude), at the owner's request, on
24 October 2026. The "status here" notes come from files in this repository
(cited), not from traffic data. Visitor counts are still unmeasured
(`portfolio/usage/usage.yaml`).

## 1. Telling crawlers which pages exist

A search engine can't rank a page it hasn't fetched. These channels only get your
pages into the index. They don't rank anything.

- **XML sitemaps.** A file listing every URL, with last-modified dates. You can
  declare it in `robots.txt` with a `Sitemap:` line, or submit it by hand in
  Google Search Console and Bing Webmaster Tools.
  *Status here:* `sitemap.xml` (a sitemap index) and `sitemap-hub.xml` are built
  and checked after every deploy (`.github/workflows/portfolio-pages.yml`).
  There's a catch that's easy to miss. The site lives under a *subpath*, and
  crawlers only read `robots.txt` at the host root, which belongs to a
  different site. So no crawler finds the `Sitemap:` line by itself
  (`platform/ci/indexnow_state.py`). The fix is a custom domain or a Search
  Console submission, and both need the owner's login. The custom-domain
  request is already in the decision queue (`pages-custom-domain`).
- **IndexNow.** A free push protocol. You POST a list of changed URLs, and Bing,
  Yandex, Seznam and others fetch them. No account needed, only a key file
  hosted on the site. Google doesn't take part.
  *Status here:* the Pages workflow announces every deploy. One by-hand
  submission got a real `200` for 1,557 URLs. "Accepted" means the engines
  were asked to fetch the pages. It doesn't mean the pages were indexed.
- **Internal links.** Crawlers follow links. A page that nothing links to (an
  "orphan") is often never found, even when it's in the sitemap. Hub pages,
  category indexes and "related tools" blocks fix this.
- **Feeds (RSS/Atom).** Feed readers and some aggregators poll them. Search
  engines use them as a cheap signal that something changed.
  *Status here:* `feed.xml` is served, and the deploy fails if the feed is empty.

## 2. Showing up well in results

These channels change how a page looks in results, and how a machine reads it,
once the page is indexed.

- **Title and meta description.** The page title is still the strongest
  on-page signal. The description is what people read in the result before
  they decide whether to click.
- **Structured data (schema.org JSON-LD).** It tells the engine "this is a
  calculator", "this is an article by X" or "these are FAQs". That can earn
  rich results, and it helps AI answer engines pull out facts.
  *Status here:* the page builder emits JSON-LD (`platform/pages/`, see
  `secondary-schema.test.mjs`).
- **Canonical URLs.** When the same content sits at two addresses, the
  canonical tag says which one to rank. Otherwise the two split the signal.
- **Speed and mobile layout.** These don't win rankings alone, but a slow or
  broken mobile page loses them.

## 3. Being found by AI assistants

More and more people now ask a chatbot before they search. So "AI search
optimization" is its own channel:

- **`llms.txt`.** A Markdown index at the site root that tells language models
  what the site offers and where the useful pages are.
  *Status here:* served, and the deploy fails if it contains no tool entries.
- **An MCP server or API.** A tool an agent can *call* gets used, not just
  cited. *Status here:* the catalogue's calculators are exposed as an MCP server
  (`channels.yaml`: `mcp-server`).
- **Clear, quotable facts.** Answer engines quote pages that state an answer
  plainly, with its source, near the top of the page. That's also good writing.

## 4. Other sites pointing at you

Search engines still treat links from other sites as votes. These channels earn
them honestly:

- **Backlinks from useful work.** Free tools, datasets and research get linked
  from forums, course pages and "awesome-lists" without anyone asking. Bought
  or swapped links break search engine rules, and they're excluded here
  (`prompts/goals.md`, honest marketing).
- **Directories and curated lists.** Product Hunt, AlternativeTo, GitHub
  "awesome-*" lists, and niche directories for the field. One honest
  submission each.
- **Citations.** For research: a DOI from Zenodo, an arXiv preprint, a
  `CITATION.cff` file. Academics cite things that are citable.
  (`channels.yaml`: `zenodo-citation`.)

## 5. Being where people already look

Some discovery never touches a search engine:

- **Package registries and stores.** npm, PyPI, Homebrew, the VS Code
  marketplace, browser extension stores, app stores. Each one has its own
  search box, and people searching there are looking for a tool.
  `channels.yaml` lists 20+ of these routes.
- **Communities.** Reddit, Hacker News, Stack Overflow, Discord, Mastodon and
  Bluesky. The rule that works is the same everywhere: answer the question
  someone actually asked, and link only when the link *is* the answer.
  Self-promotion bots get banned, so the community routes here are drafts a
  person posts, not automation (`hub-reddit-drafts`, `hub-hn-drafts`).
- **Email newsletters.** You own the list, and no algorithm sits in between.
- **Video and short-form.** YouTube is the second-largest search engine. A
  two-minute screen recording of a tool doing its job is a page that ranks
  there.

## What that means for this site

Most of the free, no-login channels are built: sitemaps, IndexNow, feeds,
JSON-LD, `llms.txt`, an MCP server, registry packages. The two biggest gaps
both need the owner:

1. **A custom domain**, so `robots.txt` and the sitemap sit at a root crawlers
   actually read. This is already queued as `pages-custom-domain`.
2. **Search Console and Bing Webmaster verification**, the only way to see
   which queries bring people in. Until then, every SEO change here is a guess
   that can't be measured.

Blogging still matters. It's the part that builds backlinks and long-tail
queries over time. But a blog post that crawlers can't find through a sitemap
mostly sits unread. The plumbing comes first.
