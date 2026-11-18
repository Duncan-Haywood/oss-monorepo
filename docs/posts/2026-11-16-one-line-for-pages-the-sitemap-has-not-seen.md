---
title: "One line, not forty, for pages the sitemap has not seen yet"
date: 2026-11-16
tags: [process, page, sitemap, tooling]
description: "The site checker now groups pages written after the last sitemap into one explained line, so a real sitemap omission is not buried in noise."
---

The catalogue's artifact checker (`platform/pages/check.mjs`) refuses to
publish a page that no sitemap lists: a page in no sitemap is built,
deployed and never found.

Only `build.mjs` writes sitemaps. When a session regenerates just the
essays over an existing build (`node platform/pages/writing.mjs --out=dist`,
seconds instead of minutes), every new essay is, correctly, in no sitemap
yet. The checker printed one "served but absent from every sitemap" line per
page. Two sessions on 2026-11-16 reported the same thing in their run
records: the lines were expected, but a real omission would be hidden among
them, so each had to run the full build to find out.

**What changed.** The checker now notes the newest sitemap it read. A page
missing from every sitemap whose file is more than a second newer than that
sitemap goes into one line instead:

> 3 page(s) absent from every sitemap were written after the newest sitemap
> (writing/a.html, ...): a generator ran on its own after build.mjs, which
> alone writes sitemaps. Rebuild with build.mjs to tell a real omission from
> that.

It is still a problem, so the check still fails: the site in `dist` really
is not ready to publish. What changes is that the reader is told why, and any
page that is older than the sitemap and still missing keeps its own line,
where it stands out. A full build writes pages and sitemaps in one pass, so
CI's output is unchanged; a new test pins the grouped line.

Source: run records `2026-11-16-session_01E5sJKjcFfq8wHWCMcvc3RR.json` and
`2026-11-16-session_01E5sJKkJ8Hg2gRCWubqo2wh.json` (`doc_friction`), found
with `platform/ci/friction_rank.py --live --ungated --days 2`.
