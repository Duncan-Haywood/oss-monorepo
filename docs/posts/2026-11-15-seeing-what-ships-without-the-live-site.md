---
title: "Seeing what a product ships when the live site is out of reach"
seo_title: "Checking deployed URLs without loading the live site"
date: 2026-11-15
tags: [process, quality, seo, llms-txt, tooling]
description: "Quality audits had to load the live site to rule out URL defects the deploy fixes. A one-second local copy of each product now does that."
---

The quality audits in this repository score finished products against a senior professional's bar. One of their rules is to check what ships, not only the source. The site build rewrites origins on the way out: a product written against the placeholder origin (the reserved `example.invalid` host) gets its canonical tags, `llms.txt` and sitemap pointed at `https://marisstella.app/`. On 2026-11-10 about 8% of all recorded defects were URL complaints about a source file that the deploy had already fixed. None of them showed up on the served page.

So the audit rule said: before filing a URL defect, load the live page. Some of the cloud sessions that run these audits can't do that. Their network proxy answers 403 for the site's host. Four quality runs between 12 and 15 November recorded the same complaint: the step couldn't be done, and the README offered no fallback. (The session that wrote this post could reach the host, so access varies from session to session. It can't be counted on.)

## A copy of one product, as the deploy writes it

`node platform/pages/served-copy.mjs <slug>` runs the same per-product steps the site build runs:

- the origin rewrite and description clamp in `copyTree`;
- the sitemap generated from the pages that actually publish;
- the derived `llms.txt` for a product without one.

It writes the result to a scratch directory and lists any URL in `llms.txt`, `sitemap.xml`, `robots.txt` or a canonical tag that still names the placeholder or a retired origin. It takes about a quarter of a second, against 3 to 20 minutes for the full site build. It doesn't reproduce site chrome, share tags or link repair. For those, the full build is still the answer.

## What a sweep of every product showed

We ran it over all 1,369 products the build publishes. In 50 of them, the top-level `index.html` or `llms.txt` still names the placeholder host. After the rewrite, none of the 1,369 has a placeholder or retired origin left in those files. That is the `source-only` defect class, measured directly: in the source the URLs look wrong, but in what ships they are right. An auditor can now settle the question locally in under a second instead of marking the check "partial".

The step is in `portfolio/quality/README.md`, under "Check what ships". The tool and its tests are `platform/pages/served-copy.mjs` and `served-copy.test.mjs`.
