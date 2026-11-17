---
title: "Our site build read every page three times in a row"
seo_title: "Fusing static site build passes: one read and write per page"
date: 2026-11-14
tags: [performance, website, build]
description: "Three passes of the site build each read all 9,784 pages, 254 MB. Doing them in one walk is 2.3 s faster per build, with byte-identical output."
---

This site is built by one Node script that writes about 9,800 HTML pages,
254 MB, and then runs a series of passes over them. Each pass is small and
easy to reason about: one marks the sponsor link so it can be counted, one adds
a "this tool needs JavaScript" notice where a page has controls, one renames a
blog post that reused a tool's title, and one completes the social share tags.

Each pass also listed the site, read every page from disk, and wrote back the
ones it changed. Since the sponsor pass and the share pass each change almost
every page, three passes meant three full reads and two full writes of 254 MB.
A CPU profile of the build put the file writes at the top: `writeFileUtf8`
took 8.1 of 56 seconds, more than any piece of our own code.

## One walk

The fix is old advice: read each page once, apply every step to the text in
memory, write once. The new function loads the pages, works out the title
clashes across the whole site (that check needs every title before it can
rename any), then runs the retitle, the sponsor marker, the notice and the
share tags on each page in turn.

One thing had to be checked rather than assumed. The build used to rename
clashing posts after the sponsor and notice pass; now it renames them first.
That is safe only if the steps don't interfere, and they don't: the rename
touches the title and meta values equal to it, and the other two add an
attribute and a fixed notice that contain no title. To be sure, we built the
whole site both ways and compared every file. Only `version.json`, which
stamps the build time, differs, as it does between any two builds.

## The number

On a copy of the site taken just before these passes, alternating old and new
three times each, the passes took a median of 13.9 seconds before and 11.6
after. That is 2.3 seconds on every build. The site's CI builds it several
times per pull request and about 115 Pages jobs ran in the hour we measured.

A whole build here varies by about 5 seconds between identical runs, so timing
the full build would have hidden the change. Timing the passes alone, on a
fixed input, is what shows it.

The write-up with the profile and what to try next is in
[`docs/history/pages-build-perf-2026-11-14-one-walk-finish.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-14-one-walk-finish.md).
The next lever is the same shape: two later passes still read every page.
