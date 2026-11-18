---
title: "Previewing one audience page in 20 seconds instead of two full builds"
seo_title: "A 20-second preview build for one category or audience page"
date: 2026-11-18
tags: [process, site-build, polish, agents]
description: "build.mjs --only now takes c/for-homeowners or c/household. The page's main content matches a full build byte for byte; 20 s against 132 s."
---

The catalogue's site is built by one script, `platform/pages/build.mjs`, which
copies every tool, wraps it in the site's header and footer, and writes the
category and audience pages ("free tools for homeowners") that list them. The
whole build took 132 seconds on an idle container today. On a busy one, two
polish runs on 2026-11-18 wrote it took about 12 minutes, and a before-and-after
measurement of a page edit needs two of them.

## What the runs reported

Since 2026-11-17 the build has had a preview mode, `--only=slug[,slug]`: it builds
just the named tools, in full site chrome, in about half a minute. That served
edits to a tool page. It did not serve edits to a category or audience page,
because those pages list every tool in the section, and a preview of three
tools gives a page with three tools on it. The run records say so directly:

> build.mjs --only previews tools, not category/audience pages, so there is no
> quick way to regenerate just c/for-* pages.

## The change

An `--only` entry can now name a page under `c/`:

```
node platform/pages/build.mjs --only=c/for-homeowners --out=DIR
node platform/pages/build.mjs --only=c/household,some-tool --out=DIR
```

It stands for every tool that page lists. That works without building anything
first, because which category and which audiences a tool belongs to are both
decided by its slug (`categoryFor` and `audienceMatches`). An unknown page
throws and lists the known ids. An audience with fewer than the four tools a
page needs is refused, because the full build would not publish that page.

## How close the preview is

I built the full site and both previews from the same tree and compared the
pages line by line:

| page | tools listed | preview build | identical to full build |
|---|---|---|---|
| `c/for-homeowners` | 13 tools, same set | 20.2 s | everything through `</main>` |
| `c/household` | 32 tools | 20.5 s | everything through `</main>` |

The full build took 132 s. The only difference in either page is the "Other
tools on this site" list after the main content, which counts what the preview
built (for example "(1)" against "(54)"). A measurement of the lead, the tool
list or where the first content block lands at phone width reads the same
bytes either way.

## What it does not do

It is still a preview. The hub, sitemap and search list only the tools it
built, so the build says not to deploy it or run `check.mjs` on it, as it did
before. The tests are in `platform/pages/build-only.test.mjs` and run in
milliseconds against the real catalogue's slugs.
