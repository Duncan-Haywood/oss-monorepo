---
title: "Our first Lighthouse run: the index pages, not the tools, failed accessibility"
seo_title: "Lighthouse accessibility audit of a static site: what failed"
date: 2026-11-11
tags: [accessibility, polish, lighthouse, static-site]
description: "We ran Lighthouse on 16 pages of marisstella.app. All 11 flagship tools scored 100 for accessibility. The research and writing indexes scored 88 and 92."
---

We had never run Lighthouse on this site. We have a contrast check, a check
that no page scrolls sideways on a phone, and a sweep that every calculator
still computes. Today we ran Google's Lighthouse 12.8.2, mobile mode, on the 16
pages a first-time visitor is most likely to open: the home page, the research
and writing indexes, the stories page, one blog post and the 11 flagship tools.

The tools did fine. All 11 flagships scored 100 for accessibility and 100 for
SEO. The weak pages were the indexes:

| page | accessibility |
|---|---|
| /research/ | 88 |
| /writing/ | 92 |
| a blog post | 95 |

What failed:

- **Coloured labels too faint to read.** Each research theme has its own
  colour, and the small theme label was drawn in it. 18 of the 31 light-mode
  colours were below the 4.5:1 contrast that WCAG asks of small text. The
  lightest green was 2.59:1.
- **A skipped heading level.** The "Start here" cards were `h3` headings
  directly under the page's `h1`. A screen reader user moving by heading
  would find no section heading above them. The small grey label above the
  cards is now an `h2` and looks the same as before.
- **Links shown by colour alone.** "Topic page →" sat inside grey text and
  only its blue told it apart, at 1.39:1 against that grey. It is underlined
  now.
- **Tiny tap targets.** The writing index lists 67 page numbers as links
  9 pixels wide. Each is now at least 24 by 24, the WCAG 2.2 minimum, and the
  row reads as an even grid. The tag pills on posts went from 21.8 to 25.8
  pixels tall.

The contrast fixes came from another session working the same morning
([PR #14667](https://github.com/duncan-haywood/oss-monorepo/pull/14667)).
This one fixed the heading, the link and the tap targets. With both, all 16
pages score 100 for accessibility.

Why did the tools pass while the indexes failed? Every tool page goes through
the same shared build steps and checks. The index pages are written by hand,
one generator each, and the browser checks we run were mostly aimed at tools.
The script that ran these numbers is now in the repository
([`platform/pages/lighthouse.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/pages/lighthouse.mjs)),
so the next check covers the indexes too.

Two limits on these numbers. They come from a local build, not the live site.
Performance under simulated phone throttling moves a point or two between
runs. The slowest pages were the wall-framing takeoff and the AI bookkeeper,
at 83 and 84, with a first paint of 3.3 seconds. They are next.
