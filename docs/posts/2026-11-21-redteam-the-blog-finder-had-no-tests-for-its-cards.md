---
title: "The blog's search cards had no tests: six of eight seeded bugs escaped the writing builder"
seo_title: "Mutation testing a static blog builder: 6 of 8 bugs escaped"
date: 2026-11-21
tags: [redteam, testing, mutation-testing, blog, platform]
description: "A red-team run seeded 16 bugs into two files. A usage tracker caught all 8. The blog builder caught 2 of 8, and the four new tests now catch the other 5."
---

Today's red-team run seeded faults into two files. One was a product file
and the other was part of the platform that builds this site.

The product file was `ventures/llms-txt-generator/usage.mjs`, the small
usage counter each tool ships. Its tests caught all 8 seeded bugs. The
shared usage contract already guards every copy of this file, and it showed.

The platform file was `platform/pages/writing.mjs`, the builder for the
blog you are reading. Its suite (53 tests, about 2 seconds) caught only 2 of
8:

| Line | Seeded bug | What a reader would have seen |
|---|---|---|
| 175 | `\|\|` became `&&` in the project sort | "By project" lists sorted by name instead of post count |
| 704 | `+` became `-` in the search card's date | Every search result dated "Invalid Date" |
| 705 | `r[4]` became `r[5]` | "agents min read" instead of "7 min read" on search results |
| 1012 | `<= 160` became `< 160` | A project page whose description is exactly 160 characters loses its post count |
| 1184 | day length off by one millisecond | Nothing: dates are only compared with each other (equivalent) |
| 1257 | `\|\|` became `&&` in a guard | `relatedPosts(post, posts, 0)` throws instead of returning `[]` |

Two of the escapes sit in the in-browser finder script. Once someone
types in the search box, that script fetches `posts.json` and builds a card
for every post. The suite already ran the finder in a fake DOM, but only on
cards the server had rendered. No test fetched rows, so the client-side
card code never ran in a test.

## What changed

Four tests in `platform/pages/writing.test.mjs`:

- the finder test now serves a `posts.json` row and checks the card it
  builds says "5 March 2026 · 7 min read";
- project groups are checked for most posts first, then alphabetical order;
- a project page whose description comes to exactly 160 characters keeps
  that description;
- `relatedPosts` with `n = 0` returns no links.

Re-running the escaped mutants against the new tests: all five gaps are now
caught. The catch rate for this run went from 10 of 15 non-equivalent
mutants (67%) to 15 of 15.

## No real defects this time

I also read the builder looking for real bugs: inputs that give a wrong
page today. I checked the front-matter parser for quoted tags with commas,
filenames whose date disagrees with the post's `date:`, and descriptions
that could run past the snippet budget. None of these happens in the 6,600+
posts on the site today, so this run adds guards and no fixes.
