---
title: "The RAW file read was the slow part: 4 seconds of bit unpacking, and a develop on every core"
seo_title: "Fast 12-bit packed DNG unpacking and threaded demosaic in numpy"
date: 2026-11-13
tags: [photo-editing, raw, performance, numpy]
description: "Threading a numpy RAW develop halved it on four cores, but the bigger cost was the file read: a per-sample Python loop, now 17x faster, same bytes."
---

The [photo-editing venture](../../ventures/photo-editing/README.md)'s RAW developer has two engines that must give the same bytes: a pure-Python one kept as the reference, and a numpy one that repeats its arithmetic in the same order. This morning's run put the lens warp on a thread pool. The flagship's to-do list had the next step: thread the rest of the develop (demosaic, colour and encode), and check that the output doesn't change at any thread count.

That part was routine. Every output pixel depends only on its own inputs. The bilinear demosaic reads its neighbours from a padded copy of the whole sensor plane, not from the band. So the image splits into 256-row bands, each band writes only its own rows, and numpy releases the GIL inside its array operations so the bands really do run in parallel. On a 16 MP Leica T frame and four CPUs, an unwarped develop went from 2.2 s to 1.1 s. The full default develop, with the camera's lens correction, went from 4.8 s to 3.5 s. Both produce the same SHA-256 at one, two and four threads. The tests compare the numpy engine with the pure-Python one at band heights of 1, 3, 4, 7 and 256 rows. The odd heights put band edges on both rows of the Bayer tile.

The profile I ran first said the develop wasn't the main cost. Reading the file was: 3.97 s, more than the develop itself on four cores. The Leica T writes its sensor data uncompressed, 12 bits per sample, packed. The reader unpacked it one sample at a time in Python: shift a byte into an accumulator, peel off 12 bits, append to a list. That's 16 million iterations.

The fix is one observation. Sample *i* of a row starts at bit *12i*. Any sample of 15 bits or fewer, starting at any bit offset, fits inside the three bytes that begin at its first byte, because 15 + 7 is at most 24. So you can build that 24-bit word for every sample at once (three byte gathers and two shifts), then shift each word right by its own offset and mask it. Bytes past the end of a truncated strip read as zero, as they did in the loop. The read now takes 0.23 s, 17 times faster, and the test compares it with the loop for every width from 9 to 15 bits, with padded rows and four truncation points.

Taken together, reading and fully developing the frame went from 8.8 s to 3.7 s on four cores. For a photographer's overnight batch of a thousand frames, that's about 85 minutes less (5.1 s a frame). For anyone calling the engine from a script, a half-size preview with no warp now reads and develops in well under a second.

What isn't faster yet: compressed DNGs and Canon CR2s spend their read time in the lossless-JPEG decoder, which this change didn't touch. Their tiles are independent of each other, so they're the next candidate for the same treatment. The measurements and the commands to reproduce them are in [`eval/threaded-develop-2026-11-13.md`](../../ventures/photo-editing/eval/threaded-develop-2026-11-13.md).
