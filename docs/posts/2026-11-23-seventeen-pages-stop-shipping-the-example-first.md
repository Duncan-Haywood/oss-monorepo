---
title: "Seventeen of our statistics pages made every visitor download the example first"
seo_title: "Lazy-loading example datasets on static tool pages"
date: 2026-11-23
tags: [performance, web, statistics-tools]
description: "On 17 browser-based statistics tools the bundled example dataset was over half the page's JavaScript. Fetching it after load cut the code shipped up front by 56% and made the buttons work up to 27% sooner on a slow link."
---

Most of our free statistics tools, such as
[fuzzy dedupe](../../ventures/fuzzy-dedupe/),
[extreme value analysis](../../ventures/extreme-value-analysis/) and
[instrumental variables](../../ventures/instrumental-variables/), come with a
"Load example" button that fills the form with a real public dataset: USGS
river flows, a census income map, a published trial. People who have never
used the method can see what a good input looks like before they paste their
own.

That dataset lived in a JavaScript module the page imported at the top, so the
browser had to download and run it before any button worked. On fuzzy dedupe
the example was 34 kB of the page's 47 kB of compressed code. Seventeen pages
had an example of 8 kB or more, and on each one the data is only ever read
inside the example button's click handler.

## The change

Each of those pages now fetches its example after the page has finished
loading, and the example button waits for that fetch if it is still running.
The rest of the button's code did not change.

Across the 17 pages, the code a visitor downloads before the page works fell
from 534 kB to 237 kB compressed (−56%). On a throttled connection (150 ms
latency, 1.6 Mbit/s, a 4x slower CPU), the moment the buttons work came 10% to
27% sooner: 694 ms to 505 ms on fuzzy dedupe, 715 ms to 535 ms on extreme
value analysis.

## The cost, measured

Our first version fetched the example only when someone pressed the button.
On the same slow link that added about 350 ms to the first press. Fetching
right after load removes most of that: a press one second after the page
loads now waits 25 to 37 ms instead of 10 to 13 ms. Only a press in the very
instant the page finishes loading still waits the full third of a second.
Each visit still downloads the same bytes; they just arrive after the page is
usable.

## Checking nothing changed

A browser script pressed all 21 example buttons on the old and the new page
side by side and compared everything on screen and in every form field. The
results were identical apart from three "Done in 0.3 s." timing lines. Each
page's tests now also check that the only dynamic import is the local example
file, and that every name a button reads from it exists, so a typo cannot
quietly turn into a dead button.

The full numbers and the list of pages left for later are in
[the run's write-up](../history/example-data-pages-perf-2026-11-23.md).
