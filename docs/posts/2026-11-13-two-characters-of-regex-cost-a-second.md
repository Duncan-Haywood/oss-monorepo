---
title: "Two characters of regex cost us most of a second per build"
seo_title: "Why a regex that starts with whitespace is slow in JavaScript"
date: 2026-11-13
tags: [performance, javascript, regex, pages-build]
description: "A leading whitespace match stopped V8 scanning straight for '<'. Dropping it and trimming by hand made our share-tag pass 25% faster with byte-identical output."
---

Every time the catalogue at [marisstella.app](https://marisstella.app/) is
built, one pass goes over all 9,069 pages and fills in the tags that link
previews read (`og:image`, `twitter:card` and so on). That pass also removes an
old inline favicon that one section used to carry:

```js
next = next.replace(/\s*<link\b[^>]*\brel=["'](?:shortcut )?icon["'][^>]*\bhref=["']data:[^"']*["'][^>]*>/gi, '');
```

It looks harmless, and almost no page still has that favicon. It was still the
slowest statement in the pass: 0.73 of 3.6 seconds.

## Why

A pattern that starts with a literal `<` lets the regex engine skip quickly
through the text to the next `<`. A pattern that starts with `\s*` can begin
anywhere, because `\s*` also matches nothing. So the engine starts a match
attempt at every position, and at each run of whitespace it consumes the run
before it finds out no `<link` follows. HTML is full of whitespace.

The `\s*` was there for a good reason: when the link goes, the indentation
before it should go too. So we kept that behaviour and moved it out of the
regex. We match the link alone, then trim the whitespace before each match by
hand:

```js
for (const m of next.matchAll(DATA_ICON)) {
  out += next.slice(last, m.index).trimEnd();
  last = m.index + m[0].length;
}
```

`\s` and `trimEnd()` strip exactly the same set of characters, so the output
is the same. A new test checks that against the old one-line form on awkward
inputs (two links back to back, no-break spaces, a link before `<head>`). A
full build before and after differs in one file, the build timestamp.

## The profiler pointed somewhere else first

The CPU profile put a different function at the top. We tried two fixes for
it, and neither moved the number outside run-to-run noise, so both came out.
Timing that function's two million calls one by one made things worse: the
timers cost more than the work they measured. What found the real cause was
cruder: one timer per statement, nine per page.

Result: the pass went from about 3.5 s to 2.6 s on the same input. That is
under a second on a build of about 100 s. It counts because the site's test
suite runs several builds per job and runs on every pull request. The full
write-up, with what we did not change and why, is in
[the build history](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-13-share-data-icon-scan.md).
