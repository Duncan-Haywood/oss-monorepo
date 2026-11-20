---
title: "A space per character and a sort of 1,377 to keep four"
seo_title: "Two exact speed-ups in a static site build"
date: 2026-11-20
tags: [performance, tooling, ci]
description: "Two loops in our site builder cost 5.1 s of CPU per build. Both now run in 0.5 s, and the 9,244 files they help write are byte-identical."
---

The site this repository publishes is built by one Node script,
`platform/pages/build.mjs`. A pull request that touches it runs the full
build at least four times: twice in its tests, once in the build job, and
once more to deploy. So a second saved in the build is a few seconds saved
on every such PR, and the test job is already the largest single step in
our CI pool (58 job-minutes in the last 600 runs).

A CPU profile of one build with a warm image cache (50 s) was mostly flat:
writing 382 MB of output, garbage collection, waiting on files. Two
functions of our own stood out.

## A space for every character

Before the builder adds a stylesheet link to a tool page, it looks for the
real `</head>`. A page's own JSON-LD can contain the text of an HTML tag, so
the search runs on a copy where every `<script>` and `<style>` body is blanked
out: each character replaced by a space, newlines kept, so positions still
line up. It did that with `block.replace(/[^\n]/g, ' ')`, one regex match per
character of every inline script, twice per page.

It now finds each newline and writes `' '.repeat(n)` for the line before it.
On 4,000 built pages the old version took 1.7 s and the new one 0.27 s, and
every one of the 4,000 strings came out equal (both count the same UTF-16
units, so emoji and Windows line endings blank the same way).

## Sorting 1,377 tools to keep four

Every tool page ends with four related tools. The ranking scores each other
tool by shared rare words, adds a bonus for the same category, and sorts.
For 1,378 tools that is about 1.9 million pairwise scores and 1,378 sorts of
1,377 entries, each to keep the top four.

Two changes, neither of which changes an answer:

- the word index now also lists, for each word, which tools use it, so one
  pass over a tool's own words scores it against every other tool at once.
  Each pair's sum is added in the same order as before, so the floats are
  the same floats;
- instead of sorting every candidate, the ranking keeps a sorted list of the
  best four (or twenty, for the pass that rescues tools no one links to).

The old ranking is kept verbatim in the test suite and compared against the
new one on a seeded catalogue full of ties. Breaking ties the wrong way
(`<=` for `<`) turns that test red.

## What it bought

Self time in the two functions fell from 5.1 s to 0.5 s per build, and a full
build before and after differs in one file: `version.json`, which records
when it was built. Wall time is the honest smaller number: in paired runs
here the build got 0.7 to 4.7 s faster, because the disk noise between runs
was bigger than the saving.

The rest of the build is writing. `writing/search.json` alone is 15.8 MB.
Whether the blog's search index needs to be that big is a question about
what visitors download, and the next run that looks at it should start
there, not at the CPU.

The reading, profile and the ranked list of what was not changed are in
`docs/history/pages-build-perf-2026-11-20-mask-and-related-tools.md`.
