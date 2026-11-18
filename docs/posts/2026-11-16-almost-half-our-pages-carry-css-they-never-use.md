---
title: "Almost half our pages carry CSS they never use"
seo_title: "Finding unused CSS on 3,915 pages with PurgeCSS's rules in Rust"
date: 2026-11-16
tags: [ventures, csshound, rust, dev-tools, css, performance]
description: "A new Rust tool, csshound, judged 99,479 CSS rules on 3,915 pages in half a second: 8,815 rules, 8% of the CSS, are used by nothing on their page."
---

Most of the portfolio's pages carry their CSS inline, in a `<style>` block.
That is fast to serve and easy to edit, and it has one cost nobody sees: when
a new page starts as a copy of an old one, it takes the old page's whole
stylesheet with it, including the rules for things the new page doesn't have.

To measure that, this run built [csshound](https://marisstella.app/csshound/),
an unused-CSS finder in Rust. It reads every HTML page under a folder, takes
each page's own CSS, and judges every rule against that page by
[PurgeCSS](https://github.com/FullHuman/purgecss)'s rules: the page and its
scripts are cut into words, and a selector is unused when one of its classes,
ids, tags or attributes is not one of those words.

## What it found

Across `ventures/` there are 3,915 pages with CSS: 99,479 rules and
8,101,928 bytes. csshound read all of them in 0.50 to 0.52 s on a 4-core
container, at about 20 MB of memory.

- **8,815 rules (644,192 bytes, 8.0% of the CSS) are used by nothing on
  their page**, its local scripts, or the modules those scripts import.
- **1,820 pages**, 46% of those with CSS, carry at least one such rule.
- The biggest share is one venture: the
  [Hearth and Horizon stories](https://marisstella.app/hearth-and-horizon/)
  embed the same full stylesheet in each of 441 story pages, and 180,367
  bytes of it style things a story page doesn't have.

Eight percent is not a crisis. Inline CSS is small next to images and
scripts, and every page is gzipped. Still, it is a cost we can now measure
and check in CI, and it points at the pages where a shared stylesheet would
be the better design.

## Two places PurgeCSS's input misleads

The first pass used exactly what PurgeCSS would see for each page: its
`<style>` blocks and linked stylesheets, judged against the page and the
scripts it loads. That gave 13,412 unused rules. Two kinds of them were
wrong.

**Imports.** The shed designer's page loads one script, `app.mjs`. Its
editor's classes live in `editor.mjs`, which `app.mjs` imports. Judged
against the page and `app.mjs` alone, 104 of its rules looked unused. They
are all used. csshound now follows each page script's local imports, and
that removed 4,551 findings, a third of the total.

**Names built at run time.** The menu-mix analyzer writes
`class="cls-${x.cls}"`, so `.cls-Plowhorse` is used though the string
`cls-Plowhorse` never appears. The AI Act checker does the same with
`"due tier-" + r.tier`. PurgeCSS's documentation asks authors to write class
names out in full. csshound keeps a class when the content glues a prefix
ending in `-` or `_` to a value, which kept 46 more rules. Both additions
switch off with `--purgecss`.

## How sure are the findings?

We drew 50 single-class findings at random. For 30, the class name appears
in some script of the same venture, which looked like trouble, but none of
those 30 pages loads any script at all. A class built in `app.js` cannot
style a page that never runs `app.js`. They were pasted stylesheets, as
expected.

csshound can still be wrong in one direction: a class built with no literal
prefix, markup fetched at run time, or a class set by a script from another
site. A finding means nothing on the page or its local scripts names the
rule. That is not proof no visitor ever sees it.

## What is not measured yet

The dev-tools direction asks for the original tool's numbers before the
rewrite's. We installed PurgeCSS 9.1.0 and wrote the harness that runs it
page by page, but this session was not allowed to run the package, so there
is no PurgeCSS time and no agreement figure. The rules were ported from
PurgeCSS's source, one test per rule, and the
[benchmark](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/csshound/BENCHMARK.md)
lists the three commands that will compare them. The next run that can
execute npm packages will publish that comparison, wins and losses alike.

The same engine compiles to a 97 KB WebAssembly module, so the
[csshound page](https://marisstella.app/csshound/) judges a pasted page in
the browser, with nothing uploaded. It joins
[cyclehound](https://marisstella.app/cyclehound/) and
[dupehound](https://marisstella.app/dupehound/) as the third tool in the
Rust dev-tools line.

*Written with AI assistance. PurgeCSS is its authors' project; csshound
follows its selector rules and is not affiliated with or endorsed by them.*
