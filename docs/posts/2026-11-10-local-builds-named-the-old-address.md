---
title: "Every local build of the site still named the address it moved away from"
seo_title: "Canonical tags pointed at a redirect: fixing a static site's default origin"
date: 2026-11-10
tags: [seo, github-pages, polish]
description: "The site moved to marisstella.app on 2026-10-30, but the build's default origin stayed github.io, so local builds and the nightly browser checks used a URL that only redirects."
---

The catalogue moved from GitHub Pages to Cloudflare at https://marisstella.app/
on 2026-10-30. The deploy workflow passes the new origin to the build, so the
live site has been right since then. The build's own default had not changed.
`DEFAULT_BASE_URL` in `platform/pages/build.mjs` still named
`https://duncan-haywood.github.io/oss-monorepo/`, and that address now serves
only redirect pages.

The deploy never uses the default, so a visitor never saw the mistake. Three
other things did:

- **Every local build.** A session that builds the site to check a change got
  canonical tags, sitemap entries and share links for the old address. A
  local build on 2026-11-10 put github.io in the canonical tag of 8,230 of its
  8,234 pages, and in all 9,495 sitemap `<loc>` entries. Two polish runs in a
  row reported losing time to it.
- **The nightly browser checks.** `published-base-url.mjs` tells
  `journey.mjs` which origin to expect. When `gh-pages` carries no CNAME it
  returns the build default, so the nightly check expected the redirect
  address in every canonical tag.
- **The repository's indexing report.** `pages_state.py` reads the same
  constant. It kept warning that the site is served from a subpath, where
  crawlers never read its `robots.txt`. That was true on GitHub Pages. It is
  not true at the domain root, and the report now says so.

## What changed

The default is now `https://marisstella.app/`. The old address joins the
retired origin list that the build rewrites to whatever base URL it is given,
so older venture pages and posts that link github.io still point at the real
page. Post links to either address become root-relative on the site.

A rebuild with no flags now puts marisstella.app in all 8,230 canonical tags
and all 9,495 sitemap entries, and no `href` names the github.io address. Before, 8,232 pages had one.

One test needed changing, and it was useful. The custom-domain test failed any
built file that mentioned the default host at all. With the default now the
site's own domain, that caught dozens of posts saying things like
"marisstella.app answered 200 for hours". Those sentences are not
canonical signals. The test now looks for the host where it would do harm: an
`href`, `src` or `content` attribute, a sitemap `<loc>`, or a JSON-LD URL. The
same check finds the host in 9,582 files of a build that really uses
marisstella.app, so it still catches what it is there to catch.

The code is in `platform/pages/build.mjs`, `writing.mjs`,
`published-base-url.mjs` and `custom-domain.test.mjs`. The numbers are in
`docs/reports/polish-2026-11-10-default-origin.md`.
