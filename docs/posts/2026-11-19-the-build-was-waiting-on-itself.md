---
title: "The site build spent 60% of its time waiting on itself"
seo_title: "Overlapping worker threads with main-thread work in a Node build"
date: 2026-11-19
tags: [performance, engineering, nodejs, build]
description: "A CPU profile of our static-site build showed the main thread idle 60% of the time. Moving one await cut a cold build from 125.5 s to 118.8 s, same bytes."
---

The catalogue at marisstella.app comes from one Node build, `build.mjs`. It
writes about 34,500 files. With no cached share cards, it takes a little over
two minutes on a 4-core machine. We profiled it today with `node --cpu-prof`,
and the biggest single entry was `(idle)`: **79.7 of 133.5 seconds**.

An idle main thread in a CPU-heavy build means it is waiting on something.
Here it was waiting on its own worker threads. Every page gets a 1200×630 share
card. Each card is drawn in pure JavaScript, about 36 ms a card. A pool of
workers draws them while the main thread waits for the pool to finish.

## Two stretches of waiting

Splitting the profile into 5-second windows shows the shape:

- 20 to 35 s: workers draw about 1,400 tool cards. The main thread is idle.
- 35 to 60 s: the main thread adds navigation and footers to every page. The
  workers are stopped.
- 60 to 125 s: workers draw the other ~6,300 page cards. The main thread is
  idle again.

The first wait was not needed. Adding navigation to a tool's pages never reads
that tool's card. It lists `.html` files only, and it refers to the card by
path. So the build now starts the tool cards and goes straight on to the
navigation pass. It waits for the cards just before the next step that does
touch them.

## What it bought

Two alternating runs each, same machine, cold cache:

| | run 1 | run 2 |
|---|---:|---:|
| before | 127.0 s | 123.9 s |
| after | 118.1 s | 119.6 s |

That is about 6.6 seconds, 5%. We had hoped for 15, the length of the
navigation pass. It falls short because four card workers plus the main thread
are now five busy threads on four cores. The two builds' outputs were compared
file by file: all 34,550 match except the build timestamp.

## What didn't work

First we tried to make each card cheaper. The colour quantiser takes about a
quarter of a card's time, and it kept its counts in a 64 MB table indexed by
colour. That looked like a cache-miss problem, because a card has only about
7,900 colours. A 192 KB hash table gave identical palettes and was no faster.
Neighbouring pixels have neighbouring colours, so the big table was already
being read in cache-friendly order. We dropped it.

The longer wait, 65 seconds for the page cards, is still there. The passes
after it walk and hash the whole output tree. Overlapping them with half-written
images needs more care than moving one `await`, so it is
[next on the list](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/pages-build-perf-2026-11-19-tool-cards-beside-chrome.md).
