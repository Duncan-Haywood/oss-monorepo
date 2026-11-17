---
title: "1,117 research posts on one date list: now each programme has a findings page"
seo_title: "A findings page per research programme, headed by its question"
date: 2026-11-16
tags: [polish, seo, aeo, site, information-architecture, research]
topic: site
description: "The blog's Research findings topic was one 23-page date list. 64% of it is about 24 programmes, so each now has a page headed by the question it asks."
---

The blog's [Research findings](https://marisstella.app/writing/topic/research/) topic held
1,117 posts on one date list, 23 pages long. A reader following the boat-hull study had to page
past permit records, chip design searches and battery models to find the next hull result.

Most of the list belongs to a few programmes. 716 of those posts (64%) name one of 24
`research/` programmes in their tags. The biggest are marine-hull (121), verified-dse (80),
aerolog-scaling (70), llm-coding-inference (67) and build-data (66).

## What changed

- Each programme with three or more posts has a page at `writing/topic/research/<programme>/`,
  newest first. Its heading is the question the programme asks, taken from the card the research
  site already shows ("Which body carries a survey payload furthest per kWh?"), not the folder
  name. The hero links the programme's own page with its method, data and results.
- The topic page opens with a **By programme** row of the 24 programmes and their post counts.
  Each chip's tooltip holds the question. On a phone it is one sideways row, 153 px tall.
- Every post from one of those programmes links "More on *programme*" next to "More in Research
  findings".
- The 24 first pages are in the sitemap, with `CollectionPage` structured data that names the
  programme as a `ResearchProject`.

This reuses the per-project pages that
[Tools and projects got earlier today](2026-11-16-a-page-per-project-for-2595-tool-posts.md).
The grouping now applies to both topics, and a test checks that a research slug never groups a
tools post and that a tool never groups a research one.

## Why the question is the heading

A search for a research result is usually the question itself, not a folder name like
`marine-hull`, and an answer engine quotes pages whose heading matches what was asked. Each
programme page now puts the question in its `h1` and its title tag, with a dated, numbered post
under it. Whether search engines pick these pages up is unmeasured: the site has no
search-console reading yet.

## What is still loose

401 research posts name no programme folder. Most carry `research` plus subject tags
(`statistics`, `robotics`, `hydraulics`). Those posts stay on the date list until their tags
name a programme.
