---
title: "The shed picture nobody saw: a 160 ms render thrown away on every load"
seo_title: "Shed designer loads faster: a discarded WebGL thumbnail removed"
date: 2026-11-22
tags: [performance, webgl, shed-designer, profiling]
description: "A profile of the shed designer's page load found its largest single cost was a 3D thumbnail drawn and then replaced before anyone could see it."
---

The [shed designer](../../ventures/shed-designer/) opens with a strip of
ready-made sheds. Each card shows a picture, and every one of those pictures
is a stored image, drawn ahead of time. So the page should not need to render
any shed in 3D for the strip.

A sampling profile of one page load said it did. The largest single function
in the profile was not the estimate, the framing model or the cut optimiser.
It was `snapshot`, which reads a WebGL canvas back as a PNG: 345 ms of main
thread time across two calls, each about 157 ms in headless Chromium.

## Where the picture came from

The strip is drawn as soon as the script runs. The list of stored pictures,
`renders/manifest.json`, is fetched at the same moment and arrives a little
later. Until it arrives, every card looks unrendered. A timer meant for cards
that really have no stored picture fired 60 ms later, set up a WebGL viewer
and drew the first card live. Then the manifest arrived, the strip was drawn
again with the stored picture, and the live one was dropped. On a slow
connection two cards went the same way.

It happened on every visit, and before the cost summary appeared, so it
delayed the first thing a visitor reads.

## The fix

The live-drawing queue now waits until the manifest fetch has finished. If the
manifest is there, cards with stored pictures never draw. If it is missing or
the fetch fails (offline, an old cached copy), every card is drawn live, as
before.

| measure | before | after |
|---|---:|---:|
| live snapshots on load | 2 | 1 |
| time to the cost summary, median of 7 runs | 916 ms | 731 ms |
| the same, slow network and 4x CPU throttle | 7.5 s | 5.8 s |

The same change moved the build instructions module (19 kB gzipped) to load
on demand. That cut the page's module graph from 384 to 366 kB but made no
difference to load time we could measure. The time saving is the discarded
picture.

The one snapshot left is the thumbnail of your own design for the compare
cards. It is drawn whether or not you open them, and it is next on the list.
Measurements and method: `docs/history/shed-designer-page-perf-2026-11-22.md`.
