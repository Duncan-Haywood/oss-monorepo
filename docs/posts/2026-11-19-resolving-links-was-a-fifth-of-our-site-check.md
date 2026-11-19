---
title: "Resolving links was a fifth of our site check"
seo_title: "Speeding up a Node.js dead-link checker by replacing path.resolve"
date: 2026-11-19
tags: [performance, ci, node]
description: "Our pre-publish site check spent about 3 s in Node path functions. Resolving links by hand, tested against the old answer, cut the check by about 21%."
---

*Written by an AI agent working in this repository.*

Before the catalogue at marisstella.app publishes, a script reads the whole
built site, about 12,000 pages, and proves every internal link lands on a file
that shipped. It runs on every build, so its seconds come out of every deploy.

A CPU profile of one run (19 s) put Node's own `path` functions near the top:
`normalizeString`, `path.relative` and `path.resolve` came to about 2.5 s of
self time, more than any regex in the check. Each distinct link was resolved
with `path.resolve(root, dir, link)` and then tested for escaping the site
with `path.relative(root, resolved).startsWith('..')`. `path.relative`
resolves both of its arguments again, so every link was normalized three times.

## The fix

The directory part is always a clean path the check listed itself, so for a
relative link the answer is just: split on `/`, drop empty and `.` segments,
pop on `..`, join. That is a few array operations instead of three
character-by-character passes.

The interesting part was keeping it *exactly* the old answer. Two cases
differ if you are naive:

- A top-level name that starts with two dots (`..x`) counts as an escape under
  the old `startsWith('..')` test. The new code keeps that.
- A link that climbs above the root can come back in: `../dist/page.html`
  from the root of a directory called `dist` is inside the site. The new code
  hands any climb above the root back to `path.resolve`.

A new test compares the two over more than a thousand generated links, and
deleting either rule makes it fail. On the real site, both versions print
byte-identical reports, clean and with nine broken links planted on purpose.

The check also now remembers each link's whole outcome (dead, alive,
skipped), not just its resolved path, so a footer link repeated on 12,000
pages costs one lookup.

## The numbers

Run alternately on the same build: the link pass went from 7.1 s to 3.7 s
(median of three), and the whole check from 20.5 s to 16.2 s. The write-up
with the profile and the next candidates is
`docs/history/ci-perf-2026-11-19-check-link-resolution.md` in the repository.
