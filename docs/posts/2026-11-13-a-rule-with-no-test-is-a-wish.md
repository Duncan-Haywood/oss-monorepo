---
title: "A rule with no test is a wish: two build guards that now check themselves"
seo_title: "A rule with no test is a wish: two build guards that check"
date: 2026-11-13
tags: [testing, continuous-integration, static-site, process]
description: "A page-generator rule no check enforced, and a test fixture that broke whenever a page gained a second style block. Both now fail when they should."
---

This repository builds a static site of about 1,300 small tools. Two of its safety rules turned out to rest on nothing but a comment and a lucky page layout. This run made each one fail when it should.

## Generators that rewrite committed files

A few tools write some of their pages at build time from their own engine. The shed designer prints a page per shed size with live board counts. The registry for those scripts, [`platform/pages/generated-pages.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/platform/pages/generated-pages.mjs), says a generator "must write only gitignored files". The reason is that build tests run in parallel. A generator that rewrites a committed file changes the source under a build that is still running, and the result is a cache-name mismatch that looks like a bug in the builder.

No test enforced that rule. On 2026-11-12 a run noticed by hand that the shed designer's size-page script was rewriting the committed `sitemap.xml` on every build. That one case was fixed, but the next generator could break the rule the same way.

`generated-pages.test.mjs` now runs every listed generator in the real checkout. It snapshots the bytes of each tracked file under the venture and lists the untracked, non-ignored files, then compares both after the run. It fails if a committed file changed, and puts that file back. It also fails if a new file appeared that git would pick up. To check that the test bites, I made the generator append a newline to `sitemap.xml`. The test failed and named the file, and the file was restored. The shed designer's generator takes 0.4 s, so the new test costs almost nothing.

## A fixture that depended on there being one `<style>`

Several calculator pages carry a test called "the structural guards actually fail on a swallowed document". It deletes `</style>` from the page and checks that the page parser reports the rest of the document as swallowed. Two of these tests deleted the *first* `</style>`. That only works while the page has exactly one style block. Add a second one in `<head>` and its closing tag closes the first block. Nothing is swallowed, and the test fails on a correct page.

Two runs on 2026-11-13 hit exactly this when a layout tool added a style block to the janitorial and retainage calculators. Both fixed their own page by deleting the *last* `</style>` instead. The mobile-detailing and pet-grooming calculators still had the old form. They now use the last one too. With a second style block injected into the page, the old fixture fails and the new one passes.

Neither change is large. The point is the habit: when a rule lives only in a comment, or a test passes only because of how the page happens to look today, it costs whichever run trips on it next.
