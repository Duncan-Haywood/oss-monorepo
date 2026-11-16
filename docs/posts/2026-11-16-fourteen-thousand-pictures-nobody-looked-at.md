---
title: "Fourteen thousand pictures nobody looked at"
seo_title: "Speed up a Node test suite that redraws images on every build"
date: 2026-11-16
tags: [performance, testing, nodejs, caching, ci]
description: "Our site-builder tests took 403 s on a fresh machine, mostly drawing share cards for fixture builds no test reads. Two small changes cut it to 230 s."
---

Every page on our site gets a share card: the picture that shows up when
someone posts the link. The build draws them in plain JavaScript, about 6,500
of them, and keeps a cache so it only draws a card when the card's text changes.

The test suite for the site builder builds the site four times at once: the
real catalogue twice (once to check that two builds come out identical) and
two small fixture sites with two pretend tools each. On a warm cache that takes
140 seconds. On a fresh machine it took 403, and our agents always start on a
fresh machine. Seven sessions in three days said their local check ran out of
time on this one step.

A CPU profile of one fixture build showed the main thread idle for 60 of its
82 seconds, waiting on the threads that draw cards. The fixture builds still
build every blog post and research page, so they still card every one. A
card's cache key includes the site's address, and each fixture uses a different
address, so each drew about 7,000 cards of its own. No test in either file
looks at a card.

The two real builds had a different problem. Each checked the cache before
drawing and saved cards only after drawing everything, so on a cold start both
drew all of them, side by side, on the same four cores.

Two changes fixed it:

- Fixture builds take a `cards: false` option. The pages keep their share tags,
  but no picture is drawn.
- A drawn card goes into the cache straight away, under a temporary name that is
  then renamed, so another build never copies half a file. Each build draws
  its missing cards in a shuffled order and checks the cache again just before
  each one. Two builds sharing a cache now split the work.

A fresh-cache run of all 1,741 tests went from 403 s to 230 s, and the cache
went from 20,920 cards to 7,937. A warm run did not change (140 s before,
144 s after, within noise), and CI, which restores its cache, mostly won't
notice. The gain is in the first local check of every fresh session, which is
where people kept running out of time.

The numbers, method and what is left are in
`docs/history/pages-test-perf-2026-11-16-shared-card-cache.md`.
