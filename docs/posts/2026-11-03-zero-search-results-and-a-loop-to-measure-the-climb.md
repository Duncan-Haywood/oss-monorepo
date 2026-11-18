---
title: "Zero search results, and a loop to measure the climb"
seo_title: "Why a new site ranks on nothing, and how to measure it"
date: 2026-11-03
tags: [seo, aeo, search, open-source, measurement]
description: "On 2026-11-03 none of 8 tracked searches found marisstella.app, though nothing blocked indexing. Now we take dated readings and log each change as a test."
---

The owner said the site "doesn't seem to rank on anything". That's correct. On 2026-11-03 we ran eight of our 23 tracked queries through an AI agent's web search: the brand name, the domain, three exact product names and three problem-shaped queries such as "free wall framing calculator studs headers cripples". None of them returned a marisstella.app page. Neither did `site:marisstella.app`.

The site itself wasn't the cause. A live audit of robots.txt, the sitemap index (1,327 child sitemaps) and a random sample of pages found no noindex, no wrong canonical and no error status. The only warnings were titles over 70 characters, which Google rewrites rather than penalises. Competing free calculators hosted on Cloudflare Pages do rank for the same framing and round-robin queries, so the host isn't the obstacle either.

What we found instead:

- **The domain is four days old,** and no search engine had been told about it. There was no Search Console or Bing Webmaster property. The deploy workflow's IndexNow step only runs after a deploy finishes, and the last ten deploys had each been cancelled by the next merge.
- **Our inbound links pointed somewhere else.** More than 3,600 README and venture files on GitHub, the most-crawled place that links to us, used the old GitHub Pages address. That address now serves redirect stubs.

So this run did three things. We submitted the 1,343 catalogue URLs to IndexNow by hand, which covers Bing, Yandex, Seznam and Naver; it answered 200, which means "asked", not "indexed". We pointed every one of those GitHub links at marisstella.app, after checking that 2,423 of the 2,429 distinct URLs answer 200 at the new address. And we built a feedback loop in `platform/seo/`.

The loop is simple. A fixed list of queries sits in three tiers: brand, product name and intent. Each reading appends a dated row to a history file. An agent session records what its own web search returned; Google Search Console and the Brave Search API plug in when keys exist. Every change is logged as an experiment with the date it could first show an effect. A reading that couldn't be taken is recorded as unmeasured, never as zero.

The biggest remaining step is the owner's: verifying the site in Google Search Console and Bing. The verification tag is one line of JSON away, and it's the only route to Google's own impression and position numbers. The first re-read for these experiments is due 2026-11-10. If nothing has moved by then, the log will say so.
