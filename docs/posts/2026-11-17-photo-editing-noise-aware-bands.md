---
title: "Same bytes, 2.2x faster: banding ShootFlow's noise-aware demosaic"
seo_title: "Noise-aware demosaic 2.2x faster with byte-identical output"
date: 2026-11-17
description: "ShootFlow's noise-aware raw develop now runs in row bands on every core: 2.2x faster and 41% less memory on 14 real raws, every output byte-identical."
tags: [photo-editing, raw, demosaic, performance, numpy]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its noise-aware demosaic blends a
sharp directional demosaic toward a soft bilinear one wherever the sharp one adds mostly sensor noise. Since
this evening it works on raws that carry no noise profile, by reading the noise from the frame itself.

That made it useful on every camera, and also slow. On a 36 MP Nikon D810 the noise-aware develop took 21.6 s
and added 5.1 GB of memory, against 3 s for the plain directional develop. That cost is why the default
demosaic still skips it.

## Where the time went

A profile on a 24 MP frame showed a 12 s develop spending most of its time on full-size scratch arrays rather
than on the demosaic:

- **The noise check (5.2 s).** It compares each sensel with its same-colour neighbours. That took twelve
  whole-frame box sums, each a fresh 64-bit copy of the frame.
- **The bilinear image (1.9 s),** built on one thread although the code that builds it is written to run on
  all of them.
- **The blend (1.2-1.6 s),** with two full-frame weight maps and several full-frame RGB temporaries.
- **The detail measure (0.9 s),** with a full RGB difference image and its square.
- **The sharp demosaic itself, in C: 0.6 s.**

## What changed

Every one of those steps now runs in bands of rows on a thread pool, so only a few hundred rows are in
flight at a time. The rule was that no output byte may change, and two details made that possible:

- **Halos.** The neighbour sums reach two rows, so each band reads four extra rows above and below. A band's
  own edge padding therefore never reaches a row it keeps, and every kept value is the same arithmetic in the
  same order as before.
- **Weights without BLAS.** The blend's per-pixel weights came from a dense matrix product. Cut into bands, it
  changed about 1 value in 1,000 by one last bit, because the BLAS library's blocking depends on how many
  rows it is given. The weights are now computed as what they are: two interpolation taps per row and per
  column. That gives the same bits in any band on any machine.

The blend also writes over the bilinear image instead of allocating a new one, and the final clip runs in
place.

## Results

The test set is the 14 largest raws in a public sample collection, from 36 MP Nikon and Pentax down to a 12 MP
phone DNG, Bayer and X-Trans. Each was developed one at a time with the old code and the new:

- **Speed:** a median 2.2x faster (1.7-2.8x). The D810 went from 21.6 s to 8.6 s. The extra time over the
  plain develop fell from 0.49 to 0.16 s per megapixel.
- **Memory:** a median 41% less added (25-45%). The D810 went from 5.1 GB to 2.9 GB.
- **Output:** all 14 are byte-identical to before, checked by SHA-256 of the 16-bit image.

The noise-aware develop still takes 2.8x as long as the plain one. Whether that is worth paying on every frame
of a 1,000-shot card is a product question, and the default stays directional for now.

Method, the per-file table and the reproduction steps are in
`ventures/photo-editing/eval/noise-aware-full-frame-cost-2026-11-17.md`. The tool is
`tools/noise_aware_cost.py`, and the bit-for-bit tests are in `tests/test_noise_aware_bands.py`.
