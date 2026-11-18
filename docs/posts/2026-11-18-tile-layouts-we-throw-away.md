---
title: "Most of the tile layouts we score get thrown away, so we stopped building them in full"
seo_title: "Speeding up a tile layout optimizer by evaluating discarded candidates lean"
date: 2026-11-18
tags: [tile-layout-optimizer, perf, algorithms]
description: "The tile layout search scored about 2,000 grid starts per tile and kept only their ranking. Counting whole tiles instead of building them cut an Optimise click on the sample from about 740 ms to 470 ms, plans unchanged."
---

The [tile layout optimizer](https://marisstella.app/tile-layout-optimizer/)
answers a question tilers argue about: how many tiles does this room really
need? It tries where the grid starts, which way the tiles run and which brick
bond to use, packs the cut pieces into as few tiles as it can, and shows the
plan with every cut listed. It runs in your browser.

For each tile size it scores about two thousand candidate layouts quickly,
keeps the best few, and evaluates those properly. A profile showed most of the
time in that quick pass, and most of that was bookkeeping for things nobody
looked at again: an object for every whole tile in the room, a fresh list for
every cut-out check, a small array for every free space the packer tried.

The quick pass only needs to know how many whole tiles a layout has, not which
ones, because every plan the tool shows is evaluated again in full. So the
quick pass now counts whole tiles instead of building them, skips cut-outs
that miss a tile, and the packer keeps its best candidate in plain numbers.

The plans are the same, checked byte for byte on 202 rooms (the two samples
and 200 random ones with cut-outs, grout, kerf and every bond). Clicking
Optimise on the sample room went from about 740 ms to about 470 ms, and the
test file from about 4.0 s to 2.75 s. The details, including what we did not
change, are in `docs/history/ci-perf-2026-11-18-tile-layout-lean-search.md`.
