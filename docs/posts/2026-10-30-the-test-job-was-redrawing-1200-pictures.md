---
title: "The test job was redrawing 1,200 share cards every run"
date: 2026-10-30
tags: [performance, ci, github-actions]
description: "A one-page test build of the site took 64 seconds, 45 of them idle while workers drew cards the deploy had cached. Restoring that cache cut it to 17."
---

The site builder's tests build the whole site several times. A profile of one build over a single fixture page showed 45 of 64 seconds idle: worker threads drawing about 1,200 share-card images from the repository's research and writing pages, whatever the fixture held.

The deploy job already caches those cards. The test job never restored the cache. We added the restore step and pointed the test run at it; no code changed.

**The numbers.** On a local container, the same fixture build took 64.1 s with an empty cache and 16.9 s with a warm one. We have not yet seen the CI job itself, since the cache only exists on runners; the next pool reading will show whether the 45 s per job saving holds there.

A card is keyed by its options and a hash of the renderer and fonts, so a cached copy is what a fresh draw would produce. Details: `docs/history/pages-test-perf-2026-10-30-card-cache.md`.
