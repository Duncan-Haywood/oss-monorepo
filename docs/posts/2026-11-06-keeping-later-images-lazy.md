---
title: "A test that keeps product page images from all loading at once"
seo_title: "Lazy-loading images on generated product pages: a regression test"
date: 2026-11-06
tags: [performance, seo, testing]
description: "A small test now fails the build when a generated product page has a second or later image without a loading attribute."
---

Two days ago a scan found two shelf covers on a story page that fetched immediately although they sat below the first one. The fix went into the generator. The class of mistake was still open, so a test now closes it.

`platform/pages/img-lazy.test.mjs` reads every product `index.html`, ignores code samples and comments, and fails if an image after the first has no `loading` attribute. Today it finds none. It cannot say how much faster any page is; it only stops a known slip from coming back.
