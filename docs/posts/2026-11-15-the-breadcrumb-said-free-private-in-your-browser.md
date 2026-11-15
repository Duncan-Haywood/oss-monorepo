---
title: "1,068 tool breadcrumbs ended in a sales line or a question"
seo_title: "Why a breadcrumb should use the product's name, not its search title"
date: 2026-11-15
tags: [polish, seo, design, platform]
description: "The trail on 1,068 tool pages ended in a search title like '— free, private, in your browser'. It now uses the name each tool declares."
---

Every tool page on the site opens with a breadcrumb under the header: Home › category › tool. On a phone the last crumb is cut off with an ellipsis, so it has about 20 characters to say which tool you are on. On Wall Framing Takeoff, the top flagship, those characters read "Wall Framing Takeof…". At full width the crumb said "Wall Framing Takeoff — free, private, in your browser".

The crumb took the tool's name from the page's `<title>` (or `og:title`). A `<title>` is written for a search results page: a name, then a line saying why to click. Across the 1,350 tools:

| last crumb | before | after |
|---|---|---|
| differs from before | | 1,068 tools |
| median length | 55 characters | 29 |
| 90th percentile | 77 | 39 |
| longest | 112 | 56 |
| ends in a question | 312 | 0 |
| contains "free" | 682 | 3 (Free Shipping…, Hands-Free…, Tax-Free…) |

The questions were the odd part. The GitHub Actions checks are titled for the search a worried developer types: "Is your red GitHub Actions check even real?" That is a good title and a strange place to be in a trail. "Home › CI checks & developer gates › Is your red GitHub Actions check even real?" reads like the site asking you something.

The same text went into the `BreadcrumbList` structured data, which is where a search engine gets the words it shows above a result ("Maris Stella Labs › CI checks › …"). So the trail in search results was a sentence too.

## Where the name was already

1,344 of the 1,350 tool pages already declare a `SoftwareApplication` with a `name`: "Actions Runner Starvation Check", "Wall Framing Takeoff", "Ad Slot Sell-Through Planner". The site build now reads that name from each tool's front page, once per tool, and uses it on every page of the tool, in the visible trail and the `BreadcrumbList` alike. Where a page declares none, it falls back to the title with its tagline cut off, the same rule the home page's cards already used. A name over 40 characters with a colon in it ("Synthetic Control: did my intervention work?") keeps the part before the colon. Shorter names keep theirs, because some colons belong to the name: "GitHub Actions secrets: inherit Check".

Nothing about the titles changed. They are still written for the search, which is their job.

## What it doesn't do

It doesn't measure anything about traffic. The trail now names the page you are on, in words that fit; whether that changes how often anyone clicks a result, nobody here can see yet (usage is unmeasured, not zero). The before and after screenshots, and the build test that now checks every tool's `BreadcrumbList` against its declared name, are in the [report](../reports/polish-2026-11-15-tool-crumb-name.md).
