# A faster cubic warp, and cubic as the default kernel (2026-11-13)

`eval/warp-kernel-cubic-2026-11-13.md` added Catmull-Rom sampling for the warps
and kept bilinear as the default because the cubic warp cost 2.2 times as much
(14.6 s against 5.7 s on the Leica T frame). This change makes the numpy cubic
warp cheaper than the bilinear one was, without changing a byte of its output,
and makes cubic the default (`DevelopSettings.warp_kernel`, `--warp-kernel`).

## What changed

1. **Padded-plane taps.** The old numpy cubic built four clamped index arrays
   per axis and gathered 16 times with 2-D fancy indexing
   (`src[ys[j], xs[k]]`), which builds a broadcast index pair per tap. Now each
   plane is edge-padded by two pixels once per warp (`_np_pad2`), so a tap past
   the edge reads the replicated edge pixel: the same value the clamped index
   read. One integer array (the top-left tap's flat index) is built per band,
   and the 16 taps are `flat[offset:].take(base)` on shifted views, with no
   index array per tap. The arithmetic is unchanged and in the same order.
2. **Threaded bands.** Bands are 64 rows (was 256) and run on a thread pool.
   Each band writes only its own output rows and numpy drops the GIL inside
   its array operations, so the bands run in parallel. `SHOOTFLOW_THREADS`
   sets the count (default: every CPU); `warp_planes(..., threads=n)` too.
3. **Bilinear** takes its four taps with flat `take` instead of 2-D indexing
   (same values).

Why "separable passes" was not the route: a warp's source point moves in x and
y at once, so the kernel cannot be split into a horizontal and a vertical pass
over the image the way a resize can. The weights are already separable (4 + 4
per pixel, not 16), which the old code used; the cost was the gathers.

## Same bytes

SHA-256 (first 16 hex) of the 16-bit develop of the Leica T DNG, numpy engine:

| render | before | after, 1 thread | after, 2 | after, 4 |
|---|---|---|---|---|
| no warp | 8f0006a926fbe3df | 8f0006a926fbe3df | 8f0006a926fbe3df | 8f0006a926fbe3df |
| bilinear warp | d3b2c05501952c4d | d3b2c05501952c4d | - | d3b2c05501952c4d |
| cubic warp | a68c6ac0001c4f91 | a68c6ac0001c4f91 | a68c6ac0001c4f91 | a68c6ac0001c4f91 |

`tests/test_dng_warp_cubic.py` checks the numpy warp against the pure-Python
one for both kernels at five band heights and thread counts, on a warp strong
enough that source points fall past every edge. The accuracy table of the
earlier note stands as it was, since the output is identical.

## Time

Leica T (Typ 701) DNG, 4928 x 3264, full develop, numpy engine, best of two,
this container (4 CPUs). Warp cost = develop time minus the no-warp develop.

| | develop | warp cost |
|---|---:|---:|
| no warp | 1.9-2.2 s | - |
| bilinear, before | 7.34 s | 5.4 s |
| cubic, before | 17.62 s | 15.7 s |
| bilinear, after, 1 thread | 6.18 s | 4.1 s |
| cubic, after, 1 thread | 10.51 s | 8.4 s |
| cubic, after, 2 threads | 7.48 s | 5.5 s |
| bilinear, after, 4 threads | 3.90 s | 1.7 s |
| cubic, after, 4 threads | 5.22 s | 3.0 s |

On one thread the cubic warp is 1.9 times faster than before; on two it costs
what the bilinear warp did; on four it is 5.2 times faster and the whole
develop takes less time than a bilinear develop did. That is why cubic is now
the default: it keeps 89% of the unwarped frame's fine detail against
bilinear's 73% (earlier note, section 2), at no extra time on a two-core
machine. `--warp-kernel bilinear` remains for anyone who wants it.

The pure-Python engine (used only without numpy) gets no faster and now
defaults to cubic too, so a warped develop there takes longer than before; it
was already tens of seconds per frame and is kept for byte-identical checks.

## Reproduce

    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/Leica%20T%20(Typ%20701).dng"
    python3 tools/warp_kernel_check.py "Leica T (Typ 701).dng"
    SHOOTFLOW_THREADS=1 python3 tools/warp_kernel_check.py "Leica T (Typ 701).dng"
