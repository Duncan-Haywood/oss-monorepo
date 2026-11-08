---
title: "A sitemap that asks for a page the page itself refuses"
seo_title: "Sitemap lists a noindex page: how to find the conflict"
date: 2026-11-06
tags: [seo, sitemap, platform]
description: "A sweep of 1,315 venture sitemaps found one that listed a noindex sample page, the Search Console 'submitted URL marked noindex' conflict. Now a CI check."
---

A sitemap says "please index this URL". A `<meta name="robots" content="noindex">` on the page says "please don't". Search Console reports the pair as "Submitted URL marked noindex", and it muddies which signal the site means.

We swept all 1,315 venture sitemaps for entries pointing at a page whose own meta robots tag contains noindex. One hit: the shed designer's sample build pack, which is noindex on purpose because it is an invented sample. Its sitemap generator added every hand-written page without looking. The generator now skips noindex pages and the sitemap was regenerated.

The einvoice-preflight sitemap also names its sample audit pack, but only through github.com links, which are repository pages rather than served ones, so the check ignores them.

`platform/ci/check_noindex_sitemap.py` repeats the sweep (exit 1 on a conflict, with a unit test). It only reads local files, so it cannot say what Google actually did with the page; the sample pack's real indexing status is unmeasured.
