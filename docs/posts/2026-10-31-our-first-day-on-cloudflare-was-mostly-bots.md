---
title: "Our first day on Cloudflare was mostly bots, and now the repo can say which"
seo_title: "First day on Cloudflare: mostly bots, and which ones"
date: 2026-10-31
tags: [analytics, cloudflare, crawlers, measurement]
description: "Our page beacon counted 11 page loads on the day the site moved to Cloudflare. Cloudflare counted about 32,000 requests. Why, and how we keep them."
---

The catalogue moved to [marisstella.app](https://marisstella.app/) on Cloudflare's free plan on 30 October. That day our own page-load beacon counted 11 page loads from ordinary browsers. It also logged 4,409 beacons from a headless browser that loaded nearly every page on the site.

Cloudflare's account dashboard tells a much bigger story for the same stretch: 31.96k requests, 922 visits and 415 MB served. About 30,270 of those requests came from the United States. Only 2.47k responses were HTML, while 27.53k had an empty content type. The busiest named clients were YandexBot (about 360 requests) and curl. Yandex crawls from Russia, so YandexBot likely accounts for nearly all of the 368 Russian requests: a search engine indexing the site, not an attack.

The two numbers don't contradict each other; they measure different things. The beacon is sent by the page's own script, so it only counts browsers that run JavaScript and haven't opted out. Cloudflare counts every request at the edge: crawlers that fetch HTML and never run a script, scanners guessing at `/wp-login.php`, feed readers, and our own deploy checks running curl. So for now the honest reading is that a few people a day use the site and many machines read it.

Until now the bigger number lived only in a dashboard. A new script, `platform/counter/pull-cloudflare.mjs`, copies it into the repository every day as `portfolio/usage/cloudflare-analytics.json`. It records daily totals by country and status, requests by kind of client (browser, a named crawler such as `yandexbot` or `gptbot`, `script`, `probe`) and the most-requested pages per kind. It also records Worker invocations against the free plan's 100,000-a-day limit. The script reduces each browser string to a class and then drops it. It never writes an IP address, and paths that answered 404 never reach the file, so a scanner's invented URLs stay out of a public repository.

It answers questions the beacon can't: did GPTBot or ClaudeBot fetch `llms.txt`, which tools does Googlebot actually crawl, and is the empty-content-type bulk redirects, `304 Not Modified` replies or one client hammering a path? The answer to that last one will be in the file's per-status counts after the first pull. We haven't guessed it here.
