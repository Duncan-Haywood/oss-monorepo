---
title: "The logo we drew from scratch on every build"
seo_title: "Cache generated PNG icons in a static site build"
date: 2026-11-15
tags: [performance, static-site, nodejs, caching, ci]
description: "Our site build drew its four app icons pixel by pixel every time, 1.2 s of CPU a build. The share-card cache already had a place for them; now they take 3 ms."
---

Our site build has no image toolchain. The share cards and the app icons
(the 192 and 512 pixel icons, the maskable one Android crops to a circle and
Apple's touch icon) are drawn in plain JavaScript, point by point, with
16 samples per pixel for smooth edges. The share cards, about 2,700 of them,
got a disk cache weeks ago: a card whose text and renderer haven't changed
is copied from the last build, not drawn again.

The four icons never got one. A CPU profile of a warm build today showed the
mark's sampling function at 1.15 seconds of the build's main thread, all of
it spent on those four icons. Their pixels depend on one file, the renderer,
which changes perhaps once a month. Every build in CI paid for them, and so
did every test file that builds the site.

## The fix

The icons now go through the same cache directory as the cards, keyed the
same way: a hash of the renderer and its fonts, plus the icon's size and
variant. If the renderer changes, every icon misses and is drawn again, just
as every card would. A hit is touched, so the workflow's daily prune keeps
it. A miss is written to a side file and renamed, so a test process building
at the same moment never reads half a PNG.

Measured in a fresh process each time, the four icons took 1,146 to 1,284 ms
to draw and take 3 ms from the cache. A full warm build uses about 1.2 s less
CPU (34.4 s down to 32.9 s on average over three interleaved runs each). The
wall-clock time per build drifts by several seconds from run to run in our
container, so the CPU figure is the honest one.

## Same bytes

A speed-up only counts if the site is unchanged. We built the whole site with
the old code and the new and compared 30,142 files. The only one that
differed was `version.json`, which records when the build ran.

## The other change, and why it barely mattered

The same run fixed a smaller thing the last reading flagged. The step that
completes each page's share tags (`og:image`, `twitter:card` and the rest)
keeps a memo of the page's `<meta>` tags, but every tag it edited threw the
memo away, so the next read rescanned the whole page. Now the edited tag is
swapped into the memo whenever that is exactly what a rescan would find.
That removed 41% of the full-page scans (17,444 down to 10,259 over the
site's 10,257 pages), and the output is identical. It saved only about a
tenth of a second, though. Profiled, that step spends its time on garbage
collection and file reads more than on the scan.

A memo that rarely misses is worth having, but a profile that points at the
wrong thing is worth knowing about too. The measurements and the ranked list
of what we didn't change are in
[the history note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-15-share-memo-swap.md).
