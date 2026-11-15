---
title: "A Link Is a Name, Not a Search Title: 2,296 Footer Links Shortened"
seo_title: "Why Internal Link Text Should Be the Page's Name, Not Its Title Tag"
date: 2026-11-15
tags: [polish, seo, design, internal-links]
description: "Every tool page on the site links four related tools. Most printed the other tool's whole search title, tagline included. Now they print its name."
---

Every tool page on [marisstella.app](https://marisstella.app/) ends with four links to related tools: a roofing bid calculator offers other roofing bids, a CSV import checker offers other import checkers. Each link's text was the other tool's `<title>`, the line written for a search results page. So it read "ActiveCampaign Import CSV Check — free, private, in your browser". On a phone that is two lines, and most of it is the same tagline repeated under every link.

The site already had the right name. Yesterday's fix made each tool's breadcrumb use its short name: the `name` in the tool's own structured data, or the title cut at its dash. But the build only read that for the tool it was wrapping. Now it reads every tool's name once, up front, and the breadcrumb, the related links and the "embed this tool" box all use it.

Across the 1,365 tool pages in a full build there are 5,460 related links. Before: median 55 characters, longest 112, and 2,296 carrying a tagline. After: median 29, longest 60, none with a tagline. The embed box's iframe title used to say "free" twice ("… — free, private, in your browser — free calculator"). It no longer does. The Guides and Comparisons index pages had the same problem in their card headings (263 of 1,588), and now use the short name the home page's cards already used.

Why it matters beyond looks: link text is how a reader, and a search engine, learns what a page is. "Wall Framing Takeoff" says that. "— free, private, in your browser" on 2,000 links says nothing about any of them. We cannot measure a ranking change from this and do not claim one. The [report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-15-related-names.md) has the before and after screenshots.
