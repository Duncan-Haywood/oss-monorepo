---
title: "Five page checks were using one core out of four"
seo_title: "Speeding up HTML lint checks with a process pool and exact pre-filters"
date: 2026-11-12
tags: [performance, ci, accessibility, python]
description: "Five page checks parsed 3,700 pages on one core. A process pool and two exact pre-filters cut them from 18.7 s to 4.5 s, same output."
---

Every pull request here runs a set of checks over every page we serve: does
each form control have a name a screen reader can say, does any page repeat
an `id`, does every `aria-describedby` and `#anchor` point at something, are
the markup basics there (`lang`, viewport, `alt`, no mixed content). Five
scripts, each feeding about 3,700 HTML pages (70 MB) through Python's
`html.parser`.

Together they took 18.7 seconds. A profile of one showed 9.39 of its 9.40
seconds inside the parser, and the reading of the files was 0.14 s. All CPU,
one process, on a runner with four cores.

## Two changes, same answers

**Use the other cores.** Each check's verdict on a page depends only on that
page, so we map the same function over a process pool and read the results
back in input order. The findings print in the same order, byte for byte.

**Skip pages that cannot fail.** The parser only reports a start tag written
as `<` followed by its name. So a page with no `<input`, `<select` or
`<textarea` anywhere (in any case) has no form control to flag, and the
label check does not need to parse it. That was 2,115 of 3,662 pages. The
same holds for the ARIA reference check: no reference attribute and no
`<label` tag, nothing to check, 2,180 of 3,754 pages skipped.

A pre-filter like that is only safe if it can never skip a page that would
fail. We checked it on the whole corpus: every skipped page was parsed in
full, and none had a single control or reference in it.

## How we know nothing changed

We copied the page tree, planted seven kinds of fault in 60 random pages, and
ran the old and new scripts on it. Every output was identical, down to the
line numbers. A new test builds 104 pages and asserts the pooled scan equals
the serial one; we broke the pool on purpose (returning results unordered)
and the test failed.

Result: **18.7 s to 4.5 s** locally, on four cores. The runners have four
too, so each pull request's validation job should get about 14 seconds back.

The lesson keeps repeating in this repository: the cost was not Python being
slow. It was one core doing work that four could share, and a parser reading
pages that could not have failed. Details:
[the perf note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-12-page-checks-pool.md).
