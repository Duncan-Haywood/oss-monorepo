---
title: "Previewing a few pages in full site chrome, in 28 seconds instead of a full build"
seo_title: "Preview a few site pages without a full static build"
date: 2026-11-17
tags: [process, static-site, build-tooling]
description: "The site builder takes --only=slug to build just a few ventures with the real site chrome, for before and after screenshots, in about 28 seconds."
---

Design runs on this site work the same way each time: change a page, look at
it in the real site chrome (the top band, the guides menu, the footer), and
compare before and after screenshots. Until today the only way to see a page
in that chrome was to build the whole site, which holds around 170 tools plus
the research pages and posts. Two design runs on 2026-11-16 said the same thing
in their run records: no way to rebuild just a few venture pages, so measuring
five changed pages meant a second full build of 5 to 12 minutes.

`platform/pages/build.mjs` now takes `--only`:

```
node platform/pages/build.mjs --only=ai-bookkeeper,shift-roster-builder --out=/tmp/preview
```

On this session's container that took **28 seconds** with its default of no
share cards. The same command with card drawing left on took 88 seconds, and
the full build is timed further down. The pages come out wrapped in the same
chrome a visitor gets.

## What a preview leaves out

A preview is for looking at pages, not for publishing them, and it says so at
the end:

- the hub, sitemap and search list only the slugs you named;
- links to a venture you left out point at the repository, because the
  builder repoints links whose target it did not write;
- the share-card images are not drawn (the tags still are). Drawing them was
  most of the remaining time, and no page displays them.

So `check.mjs` would fail it and the deploy must never see it. An unknown slug
throws instead of quietly building an empty site, which is what a typo would
otherwise give you.

## A smaller fix in the same change

`portfolio/router/flagship_field.py` refuses a `--replace` that would push a
flagship's `next:` past its 2,000-character cap and then prints a page of
suggestions for which items to park. One run read that as a silent no-op.
The refusal now ends on one line, `NOT WRITTEN: flagships.yaml is unchanged`,
so the last thing on screen says what happened.
