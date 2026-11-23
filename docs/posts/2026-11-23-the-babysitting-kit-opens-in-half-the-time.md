---
title: "The babysitting kit now opens in about half the time"
seo_title: "Babysitting Business Kit loads 42% faster on a slow phone"
date: 2026-11-23
tags: [performance, babysitting-business-kit, web]
description: "The app has 19 tabs and opens on one. Loading each tab's code the first time it opens cut the page from 240 to 103 kB and a throttled load from 2.2 s to 1.3 s."
---

The [Babysitting Business Kit](../../ventures/babysitting-business-kit/) is a
free back office for a one-person babysitting business. It has grown to 19
tabs: leads, families, schedule, money and taxes, invoices, packages,
agreements, a blog, a safety check-in and more. It opens on one of them, Today.

Until today the browser downloaded and set up the code for all 19 tabs before
the page was ready. That was 240 kB compressed over 36 requests. On a slow
phone connection (we simulate 150 ms of latency, 1.6 Mbit/s and a CPU four
times slower than a laptop), the page took a median of 2.2 seconds to finish
loading.

Nine of those tabs draw only inside themselves: Families' sit reports,
Insights, Invoices, Packages, Agreements, Activities, Posts & blog, Network and
Safety. Their code now loads the first time you open the tab. Under the same
throttling the page now loads 103 kB over 17 requests, and finishes in
**1.3 seconds, 42% faster**. Opening one of those tabs for the first time costs
one small download, about 10 to 24 kB.

Nothing you see changed. We checked by loading the example business in the
old page and the new one, opening all 19 tabs, and comparing what each tab
showed and what was saved. Every tab came out byte for byte the same. If a
tab's code can't be fetched, the tab says so and tries again the next time you
open it. The installed app still works offline, because its offline cache
already followed this kind of import.

The method, numbers and what to look at next are in
[the perf note](../history/babysitting-kit-page-perf-2026-11-23.md).
