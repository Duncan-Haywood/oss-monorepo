---
title: "The Research Page Scrolled Sideways on a Phone, and 4,538 Pages Had No Guard"
seo_title: "Why Our Research Index Scrolled Sideways on Phones"
date: 2026-11-10
tags: [polish, accessibility, reflow, mobile]
description: "One long file path in a research card made /research/ 428px wide on a 390px phone. The real cause: site pages never got the reflow CSS tool pages had."
---

At a 390 px phone width the [research index](/research/) was 428 px wide, so the whole page scrolled sideways. The cause was one card in "Ongoing work". Its latest log line quoted a file path, `experiments/hub_throughput/cargo_hub_trace_taper.py`, and a path contains no spaces, so the browser had nowhere to break it.

The site already guards against this. `reflow.mjs` holds a short set of rules, all at zero specificity: long words in headings and inline code may break, `<pre>` blocks scroll inside their own box, and grid tracks holding form controls may shrink. Those rules came from measuring the tool pages and fixing every way they overflowed. But the rules lived only in `pf-chrome.css`, which only the tool pages link. The pages the site writes itself (the hub, research, the blog, Stories, comparisons and guides) link `pf-site.css`, and that file never included them. That is 4,538 pages.

Three other things stacked on top. The research template set `white-space: nowrap` on every `<code>`, which forbids wrapping completely, so even the shared rule could not have helped there. And the index pages for comparisons, guides and About used `minmax(320px, 1fr)` card grids. At the 320 px width WCAG uses for its reflow test, such a grid cannot fit, because a 320 px column inside a padded page is wider than the window. And /about/ named `generativelanguage.googleapis.com` as plain text in a list item, with no `<code>` around it to catch.

## What changed

- `pf-site.css` now includes the same reflow rules as `pf-chrome.css`. A test fails if they are separated again.
- In the research template, `<code>` now uses `overflow-wrap: anywhere` instead of `nowrap`. A token can now break at a space like any text, and a long path breaks mid-word only where it would otherwise overflow.
- Paragraphs, list items and quotes may now break a word that would otherwise overflow. Table cells are left alone, since wide tables already scroll inside their own box.
- 17 card grids now use `minmax(min(Npx, 100%), 1fr)`. Above N pixels the layout is exactly the same as before. Below N, the column shrinks to fit instead of pushing the page wider.

## Measured

I loaded every site-owned page in headless Chromium and compared its scroll width with the viewport, before and after the fix. The full numbers are in the [run report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-10-site-pages-reflow.md). At 360 px, /research/ (428 px) and /engineering/ (451 px) both stop scrolling sideways. At 320 px, /compare/, /guides/ and /about/ (338 to 341 px) now fit too. A sample of 458 tool pages, which also get the new body-copy rule, showed no overflow at 360 px. The 404 page also showed up, but only because the local build points its stylesheet at the old domain; the live page links the right one.

This post makes no claim about traffic or rankings. A page that fits the screen is simply easier to read on the phone most visitors are holding.
