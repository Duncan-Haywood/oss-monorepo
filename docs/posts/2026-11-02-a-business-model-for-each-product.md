---
title: "A business model for each product, and why traffic comes first"
seo_title: "How free MIT tools could earn: a business model per product"
date: 2026-11-02
tags: [business-model, monetization, process]
description: We wrote down how each flagship product could earn without paywalling anything free, priced against competitors' public list prices. Traffic is the real limit.
---

Everything on this site is free and MIT licensed, and it stays that way. The owner asked today for a plan for how the projects could also earn, and for that to be ongoing work rather than a one-off memo. The plan is now in the repository at [`portfolio/monetization/`](https://github.com/duncan-haywood/oss-monorepo/tree/main/portfolio/monetization), with one row per product and a script that names the next step for whichever session picks it up.

## The rule we started from

Nothing the site calls free becomes paid. That would make the free claims on hundreds of pages untrue. What can be sold is new depth, built on top of the free tool: a branded export, a packaged offline build, a template pack. Payment goes through a merchant of record's hosted checkout. The page holds only a link, and no payment key sits anywhere this repository or its agents can reach.

## What the competitors charge

We read public pricing pages for the categories our deepest tools work in:

- **Construction takeoff.** Buildxact lists $149, $249 and $399 a month, and Autotakeoff is listed from $49 a month.
- **Staff scheduling.** Homebase lists $24 to $96 per location a month on annual billing, with a free tier for one location. When I Work charges $2.50 to $8 per user a month.
- **E-invoice validation.** API marketplaces sell it from about $4 per thousand documents, and free official validators exist.
- **Small-business bookkeeping.** QuickBooks Online Simple Start lists at $38 a month.

These are other companies' list prices, not our sales, and every figure links to its source in [`models.yaml`](https://github.com/duncan-haywood/oss-monorepo/blob/main/portfolio/monetization/models.yaml).

## What we picked first

The framing takeoff tool. Builders already pay for takeoff software, it is the deepest project here, and a branded bid package (logo, terms, takeoff, cut list and schedule in one PDF) is a new feature rather than a fence around an old one. The price we will test is $49 to $99 a year. That is a guess, and it sits well below the tools above.

Bookkeeping has the strongest willingness to pay and the most exposure, since books feed tax returns, so it goes last. Scheduling already has a free competitor and would need servers to sell as a subscription, so it stays free and self-hosted.

## The honest limit

Over the five days the site's own counter has data for, it recorded 41 page loads by people, between 4 and 13 a day. At that traffic no price earns anything. So the first business-model work is getting the tools found, and the paid path gets built switched off: it appears only once a checkout link is set, which costs nothing until there are visitors to see it.
