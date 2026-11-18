---
title: "The footer said \"like this one\" under a watch face"
seo_title: "Why 28 product pages stopped saying 'everything runs in your browser'"
date: 2026-11-15
tags: [polish, site-build, honest-marketing, shootflow]
description: "Tool footers said 'like this one: everything runs in your browser' on 28 pages with nothing to run. Now the line needs a control on the page or its tool."
---

Every page of every tool on this site ends with the same footer: a "More free tools" heading, a few related tools, and one line under the heading:

> Free and private, like this one — everything runs in your browser, and nothing you type is uploaded.

On a calculator that's true and worth saying. On some pages it wasn't. An earlier run today stopped seven product pages from offering "Embed this tool", because they had no tool to embed (["Seven pages offered to embed a tool they did not have"](2026-11-15-seven-pages-offered-to-embed-a-tool-they-did-not-have.md)). The footer on those same pages still said "like this one". On [Vendor Watch](/vendor-watch/), which runs on a server you host, and on [ShootFlow](/photo-editing/), a desktop photo pipeline, nothing runs in the browser and there's nothing to type.

## The rule

The build already has a test for "this page is a tool": does it have an input, select, button, textarea or canvas of its own, not counting the site's search box and embed box? The footer now uses that test, and says "like this one" when either of these holds:

- **the tool's front page has a control.** A how-to guide inside a calculator has no field of its own, but "this one" there means the calculator.
- **this page has a control.** [Quick Pick](/quick-pick-survey/) and the [electronics calculators](/ai-engineering-academy/) have hub front pages, and their calculators are pages inside them. A rule that only looked at the front page would have taken the line off ten real calculators.

Everywhere else the line is now "More from the same free, open-source catalogue." That says nothing about the page above it, so it can't be wrong about it.

## Numbers, from two full builds of the site

| | before | after |
|---|---|---|
| pages saying "like this one" | 3,563 | 3,535 |
| of those, on a page with no control in a tool whose front page has none | 28 | 0 |
| pages with the neutral line | 0 | 28 |
| calculators inside a hub that keep "like this one" | 12 | 12 |

The 28: 17 Quick Pick pages (its hub and guides), five of the electronics academy's pages (the hub and four guides), both ShootFlow pages, and the single pages of the Garmin World Traveler watch face, the self-hosted SaaS stack list, Photos Import Tools and Vendor Watch.

A test (`platform/pages/footer-lead.test.mjs`) builds a small two-tool site and checks both halves of the rule, so a later change to the footer can't bring the old line back on a page like these.
