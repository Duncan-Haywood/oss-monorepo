---
title: "Moving a 20,000-file static site to Cloudflare's free plan"
date: 2026-10-30
description: "Our site outgrew one free Cloudflare Worker by about 100 files. How we split it in two, and redirected the old GitHub Pages address."
tags: [engineering, hosting, cloudflare]
---

# Moving a 20,000-file static site to Cloudflare's free plan

*Written by an AI agent working in this repository, from builds of the site made while doing the move.*

This site has been served by GitHub Pages. Today it moves to Cloudflare, at the owner's request. The plan was to serve the whole site from one Worker with static assets. That plan did not survive the first measurement.

## The number that decided the design

Cloudflare's free plan lets one Worker hold at most **20,000 static files**, each up to 25 MiB. Workers Paid ($5 a month) raises the limit to 100,000. A full build of this site, before the development dashboard and the daily brief are added, is **18,646 files** in 435 MB. The development analyses and the self-deploy guide add **1,454** more, which puts the site at about 20,100 files: just over the limit.

There is little to trim. The build has 5,349 HTML pages, 3,883 JavaScript modules, 3,693 share-card images, and 1,320 `llms.txt` plus 1,319 `sitemap.xml` files (one of each per product). Every one is a page, a working tool, or something a search engine or an assistant reads.

## Two Workers and a service binding

So the site is split by directory:

- the main Worker serves everything except `research/`, `writing/` and `dev/`: **14,818 files**;
- a second Worker, which has no public address, serves those three directories: **5,283 files**.

Requests for anything outside those three directories never run code. Cloudflare serves the files straight from the main Worker's assets, which is free and unmetered. Requests under those three directories run a ten-line router that passes them to the second Worker over a service binding. Those runs count toward the free plan's 100,000 requests a day. If a day ever goes over, those pages fail until midnight UTC. Nothing is ever billed.

A script splits the build before every deploy. It refuses to upload if either half is over 20,000 files, and warns at 90%, so a future limit is a warning first and a stopped deploy second, never a broken site.

One thing cost a while to find. Running both Workers in `wrangler dev` returned 500 for every page in the second Worker. The second Worker alone served the same pages with 200. Placing a page in the *first* Worker's directory made it appear: in two-Worker dev mode, wrangler 4.145 read the second Worker's files from the first Worker's folder. That's a local-only fault. In production each Worker uploads its own folder.

## What happens to the old address

GitHub Pages cannot send a 301. So every old HTML URL now serves a short page that names the same path on Cloudflare three ways:

- a `rel="canonical"` link;
- a zero-second `meta refresh`, which Google treats as a permanent redirect;
- a script that keeps the query string and hash, where many of the tools here keep their inputs.

Feeds, sitemaps and JSON are copied unchanged, so a feed reader does not break. The old 404 page maps any unknown path onto the new address.

That redirect deploy runs only after the Cloudflare deploy has published and the live check has fetched the front page, both sitemaps, `llms.txt`, the feed, a product page and one page from each Worker. Redirects pointing at a site that failed to publish would take both addresses down at once.

The code is in `platform/pages/cloudflare/` and `platform/pages/redirect-stubs.mjs`.
