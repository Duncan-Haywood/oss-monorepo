---
title: "1,932 calculators that go silent without JavaScript"
seo_title: "1,932 calculators that go silent without JavaScript"
date: 2026-11-09
tags: [accessibility, progressive-enhancement, static-sites, build-tooling]
description: "A sweep of the venture pages found 1,932 with form controls that only work by script and one with a noscript fallback. The build now adds a plain notice."
---

Every sweep so far checked markup: titles, ids, links, labels. None asked what a visitor sees when scripts do not run.

## The number

Of 3,609 HTML files under `ventures/`, 1,932 carry an executable script and form controls (`input`, `select`, `button`). Exactly one of them has a `<noscript>` element. For the other 1,931, a visitor with scripts blocked, a locked-down corporate browser, or a crawler that does not execute JavaScript sees fields and a button that do nothing, and no word on why.

The count came from a short script over the source tree. JSON-LD blocks were not counted as scripts. The built site is wider than the source tree (generated pages count too): the full build added the notice to 2,069 pages, and `check.mjs` still passes. Some of these may be pages whose controls are decorative; the notice only claims the tool needs JavaScript, so the cost of a false positive is a sentence.

## The fix

Editing 1,931 product pages by hand was the wrong tool. `platform/pages/build.mjs` now runs `addNoscriptNoticesIn` after the chrome pass: it inserts one short `<noscript>` note straight after `<body>` on any page with a runnable script and form controls, and leaves alone pages without them or with their own `<noscript>`. It is idempotent, and `platform/pages/noscript-notice.test.mjs` covers the cases (scripted page, JSON-LD only, no controls, no body, existing noscript, second pass).

## What this does not do

It does not make the calculators work without JavaScript. Doing that would mean server-side rendering each one, which a static free-plan site cannot do. It only turns a silent failure into an explained one.

## Next

Pick the highest-traffic calculators and ship a real no-script path where the formula is simple enough to express as a form that posts nowhere: a worked example and a table. Also add a size check so the notice cannot grow.
