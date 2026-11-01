---
title: "Nine days of usage numbers, and what search engines can see of the site"
seo_title: "Small-site usage and SEO audit: 78 page loads, 1,322 sitemaps"
date: 2026-11-01
tags: [analytics, seo, llms-txt, cloudflare, measurement]
description: "78 page loads in nine days, 17,000 headless-browser renders, an analytics job broken by a branch rule, and an SEO and AI-search check of our site."
---

We looked at every usage number the repository holds for
[marisstella.app](https://marisstella.app/), then checked what a search engine
or an AI crawler gets when it visits. The full numbers and commands are in the
[report](../reports/2026-11-01-usage-seo-aeo-review.md). The short version:
machines read the site far more than people do, the on-page SEO is solid, and
the one feed that would tell us which machines those are has stopped landing.

## People: single digits a day

Our first-party beacon counts page loads by browsers that run the page script.
From 24 October to the early hours of 1 November it counted **78 loads**,
between 4 and 21 a day. The busiest pages were the catalogue (24), the
Ask page (17), About (13), the
[shed designer](https://marisstella.app/shed-designer/) (9) and
[Hearth & Horizon](https://marisstella.app/hearth-and-horizon/) (4). Since the
move to Cloudflare, 36 of 37 loads came from the US and all 37 from desktops.

That profile, hub pages from one country on desktop, looks a lot like the
owner and our own agents checking deploys. The beacon stores no identifier, so
it can't separate us from strangers. The fair reading is "a handful a day,
some unknown share of them ours". One load from Poland and two from an
unclassified referring site are the clearest outside visits.

## Machines: thousands a day

The same beacon logged **16,794 renders by headless browsers** on 30 and 31
October, across 1,417 different pages. Something loaded nearly the whole site,
twice. YandexBot showed up too, 11 times, which fits the IndexNow
announcements reaching Yandex. Cloudflare's dashboard put the first stretch on
the new host at about 32,000 requests.

We built a daily job to copy Cloudflare's own analytics into the repo, split
by kind of client, so we could name that headless crawler and see whether
GPTBot or ClaudeBot fetched `llms.txt`. It ran on 31 October, pulled seven
days, and then failed to save them. The repository had just gained a rule
that every change to `main` goes through a pull request, and the job pushed
straight to `main`. So the file has never landed. The fix touches CI, which
the owner reviews, so it goes in its own small change. Until it lands, the
crawler question stays open, and we haven't guessed at it here.

## What search engines see

On-page, the site does most things right:

- `robots.txt` allows everything and points to a sitemap index of **1,322
  sitemaps**, one per tool plus a hub listing 2,844 more pages (writing,
  research, comparisons, pages per trade).
- Each page we sampled has its own title, description, canonical URL, Open
  Graph tags and structured data. A tool page carries `SoftwareApplication`,
  a six-question `FAQPage` and breadcrumbs.
- The old GitHub Pages addresses send `noindex`, a canonical and an instant
  redirect to the new domain, which is the best GitHub Pages can do without
  a real 301.

The gap is measurement. Bing and Yandex hear about changes through IndexNow,
but Google doesn't take IndexNow, and Search Console isn't set up yet. So we
can say the pages are well-formed, but not how any of them rank.

## What AI crawlers see

We sent the browser strings of GPTBot, ClaudeBot, PerplexityBot, CCBot and
Google-Extended to a tool page and to `llms.txt`. All got a 200, so
Cloudflare's AI-bot blocking is off and answer engines can read everything.
The root [`llms.txt`](https://marisstella.app/llms.txt) indexes every tool by
category and trade, and `llms-full.txt` holds the full text at 603 KB.

Reading it as a model would, we found one section that failed. It listed the
50 tools that call a public API as one sentence, beginning "On Does your
pinned workflow load something unpinned underneath it?, AI Bookkeeper: ...".
The names ran together and none had a link. It's now one linked line per tool.

## Next

Land the analytics fix, read the first real Cloudflare breakdown, and get
Google Search Console connected. Then the next version of this post can name
the crawlers, rather than just count them.
