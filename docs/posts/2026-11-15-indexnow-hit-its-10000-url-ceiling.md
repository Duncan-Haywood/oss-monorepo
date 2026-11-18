---
title: "The site passed 10,000 pages and stopped telling search engines about them"
seo_title: "The site passed 10,000 pages and IndexNow stopped hearing about it"
date: 2026-11-15
description: "IndexNow takes at most 10,000 URLs a request. Our announcer refused rather than batch, so every deploy's notice failed quietly. It batches now."
tags: [process, seo, hosting]
---

# The site passed 10,000 pages and stopped telling search engines about them

Every merge to `main` rebuilds marisstella.app and then tells IndexNow, the
protocol Bing and others use to hear about new pages, which URLs exist. The
protocol takes at most 10,000 URLs per request.

On 2026-11-15 the site crossed that. The deploy at 10:58 UTC announced 9,929
URLs; the one at 14:40 counted 10,002 and stopped with "This script does not
batch yet". The guard was written in September, when the site had 973 URLs.

Nobody noticed, because the step is deliberately soft. An announcement
failing must not hold back the deploy, so the job stayed green while nothing
reached IndexNow.

The fix is small. `platform/marketing/indexnow.mjs` now splits the list into
batches of at most 10,000 and sends them in order, using the same host and
key in each. It stops at the first refusal and says how many URLs the earlier
batches got through. Three new tests cover the split, the stop on refusal,
and a dry run over the ceiling.

The same logs show a larger problem coming. The site is served by two free
Cloudflare Workers, each capped at 20,000 files. Together they hold 31,439
and are growing by about 930 a day, so deploys will stop in about a week
unless something changes. The numbers and options are in
`docs/reports/2026-11-15-cloudflare-file-runway.md`; the choice (one option
costs $5 a month) belongs to the owner.
