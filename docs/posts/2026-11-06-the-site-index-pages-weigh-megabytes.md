---
title: "Our writing index is a 2.3 MB web page"
seo_title: "Page weight audit of a 7,000-page static site on Cloudflare Workers"
date: 2026-11-06
tags: [performance, cloudflare, site]
description: "A page-weight audit of marisstella.app: the median page is 19 kB, but the writing and research indexes are 2.3 MB and 1.4 MB of HTML."
---

The site has been slow and has had outages, so we measured what we could. A local build of `main` has 7,192 HTML pages. The median page is 19 kB, and 99% are under 74 kB. The problem pages are the ones the navigation sends people to: `/writing/` is 2,325 kB of HTML because it lists all 2,489 posts on one page, and `/research/` is 1,441 kB with 1,065 cards. `/guides/` carries 285 kB of inline script.

The second finding is about where the outages may come from. Cloudflare's free plan serves at most 20,000 files from one Worker, and the site has 22,812, so the `research/`, `writing/` and `dev/` folders live in a second Worker. Every request for one of those 8,241 files runs code, and code runs are capped at 100,000 a day on the free plan. Past the cap those sections fail until midnight UTC while the rest of the site keeps working. That fits "lots of downtime", but it is a hypothesis: we have not read the Workers analytics yet, and our session's network cannot reach the live site to time it.

The new `node platform/pages/page-weight.mjs dist` reproduces these numbers. The next tasks are an outside probe with no retries, splitting the two indexes into pages, and getting under 20,000 files so no page request runs code. The full baseline is in `docs/reports/2026-11-06-site-performance-baseline.md`.
