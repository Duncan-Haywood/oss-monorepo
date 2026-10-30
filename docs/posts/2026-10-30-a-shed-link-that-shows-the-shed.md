---
title: "A shed designer link that shows the shed"
date: 2026-10-30
tags: [shed-designer, sharing, seo]
description: "Why a shared link to the shed designer previewed as a text card, the three small things in the way, and the 53 KB picture that replaces it."
---

Most people who find a tool like the [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) find it through a link someone pasted: in a forum thread about a backyard build, a neighbourhood group or a message to a spouse. Whether that link shows a picture decides a lot about whether anyone clicks it. Until today it showed a generic text card, even though the tool draws good pictures of its own sheds.

Three things were in the way.

1. **None of the venture's three pages named a picture.** `index.html`, the worked example (`shed-plans-with-cut-list.html`) and the HOA packet page carried an `og:title` and an `og:description` but no `og:image`. The site build filled the gap with the site-wide card.
2. **A relative picture would not have worked either.** The stored renders live beside the page, in `renders/`, so the natural tag is `content="renders/..."`. Link scrapers don't resolve relative `og:image` URLs. The site's share pass (`platform/pages/share.mjs`) already kept a page's own picture rather than drawing a card over it, but it left the path relative. It now resolves a relative `og:image` against the page's own address, and copies the result to `twitter:image`. An absolute or protocol-relative URL is left alone, and so is a page with no known address. Five new assertions cover it in `share.test.mjs`.
3. **The site would not serve a `.jpg`.** The build's extension allowlist (`check.mjs`) had WebP and PNG, but no JPEG, because nothing on the site had used one. The stored renders are WebP, and not every link scraper reads WebP. A 1200x630 PNG of the render would have been several hundred KB. So JPEG went on the list.

**The picture itself.** `make-renders.mjs` already draws every preset in headless Chromium with the tool's own WebGL viewer. It now also draws the default 8x12 at 1200x630, the size share cards are laid out for, as a JPEG. The file is `renders/og-8x12-share.jpg`, at 53 KB. The view lives in a separate `EXTRA_VIEWS` table. The main `VIEWS` table goes into every stored picture's scene hash, so adding a view there would have marked all 37 designs' pictures stale and redrawn about 760 KB. The extra table keeps the change to one file.

A side finding: on `main` this afternoon, all 37 stored designs' pictures were already stale against the current model. Several lanes had changed geometry since the last redraw. That isn't a bug. The site build redraws stale pictures before it publishes, and the test only warns outside that build. But the committed copies that pull-request previews show are a step behind, and a batched refresh is due.

The test that guards all this is short. It checks that each of the three pages names the drawn file, that the file is a 1200x630 JPEG within a 90 KB budget, and that `EXTRA_VIEWS` never overlaps `VIEWS`.
