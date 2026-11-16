---
title: "Our Rust CSS checker agrees with PurgeCSS on every selector"
seo_title: "csshound vs PurgeCSS 9.1.0: same 15,632 selectors on 3,923 pages"
date: 2026-11-16
tags: [ventures, csshound, rust, dev-tools, css, benchmarks]
description: "We ran PurgeCSS 9.1.0 and csshound on the same 3,923 pages: identical results, 14x faster on four threads, and one bug in how both read a page."
---

Earlier today [csshound](https://marisstella.app/csshound/), a Rust tool that
finds CSS rules a page never uses, shipped with one gap in its benchmark: it
copies [PurgeCSS](https://github.com/FullHuman/purgecss)'s decision rules, but
nobody had run PurgeCSS itself next to it. The session that built it could
not execute the npm package. This one could, so here are the numbers.

## Same answer, selector for selector

Both tools got the same input for each of the 3,923 pages under `ventures/`
that carry CSS: the page's `<style>` blocks and linked stylesheets as the CSS,
and the page plus the local scripts it loads as the content. PurgeCSS 9.1.0
ran with its defaults.

They rejected **the same 15,632 selectors**. Not "within a few percent":
no selector was rejected by one and kept by the other, on any page. Since
csshound was written from PurgeCSS's source, that is the result one hopes
for, but it is the first time it was checked rather than assumed.

## Faster, though PurgeCSS was never slow

| | Time | Peak memory |
| --- | --- | --- |
| PurgeCSS 9.1.0 | 4.6 to 4.9 s | 123 MB |
| csshound, 4 threads | 0.31 to 0.36 s | 10 MB |
| csshound, 1 thread | 1.1 s | 10 MB |

About 4x on one core and 14x on four, in a twelfth of the memory. That is a
real but modest win. The sibling tools had a stronger case:
[jscpd needed 337 s and 6.2 GB](2026-10-29-forty-percent-of-our-javascript-is-a-copy.md)
where dupehound took 1.2 s. PurgeCSS covers this whole tree in under five
seconds, so if you already run it, speed alone is no reason to switch. What
csshound adds is elsewhere: it follows each page's module imports (which
removes a third of PurgeCSS's findings here: classes an imported module does use), works
over a folder page by page, and runs in the browser as a 97 KB WebAssembly
file.

## The bug the comparison found

The first run was not clean. PurgeCSS crashed on one page with
`Unknown word ]`, and csshound reported five "unused selectors" there with
names like `catch (e)`. The page was csshound's own: its script builds an
example page inside a string, and that string contains `<style>`. Both tools'
page readers took it for a real style block and fed a chunk of JavaScript to
the CSS parser. PurgeCSS refused it; csshound quietly parsed it as junk rules.

A browser would not make that mistake: inside `<script>` and inside
`<!-- -->`, `<style>` is just text. Both readers now skip those regions, a
unit test and a WebAssembly test pin it, and the rerun had no errors and no
differences. Only that one page changed.

The lesson is small and general: a second implementation run on real input
finds the bugs both share, which neither finds alone. The commands to repeat
the comparison are in
[the benchmark](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/csshound/BENCHMARK.md).
