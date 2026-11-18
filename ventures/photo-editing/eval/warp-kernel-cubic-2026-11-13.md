# Cubic (Catmull-Rom) resampling for the warps, against bilinear (2026-11-13)

The DNG 1.7.1.0 specification says of WarpRectilinear and WarpRectilinear2: "It
is recommended that implementations use a suitable resampling kernel, such as a
cubic spline" (p. 107, read from Adobe's PDF). Until today every warp here
sampled bilinearly. `--warp-kernel cubic` (`DevelopSettings.warp_kernel`) now
samples 4 x 4 taps with Keys' cubic convolution at a = -0.5, the Catmull-Rom
spline. It reproduces quadratics exactly, overshoot at hard edges is clipped to
the plane's range (as the specification clips after every opcode), and taps past
the edge take the edge pixel. The pure-Python and numpy engines give the same
bytes (`tests/test_dng_warp_cubic.py`, for WarpRectilinear, WarpRectilinear2 and
WarpFisheye). The same kernel serves the lensfun warps (`--lens-db`).

Not checked: which kernel and constant Adobe's DNG SDK uses. This is the kind
of kernel the specification names, not a copy of Adobe's.

## 1. Accuracy under a real camera's warp

The Leica T (Typ 701) DNG's own WarpRectilinear terms (green: kr0 0.9708,
kr1 0.0256, kr2 0.0023, kr3 0.0012, centred) were run on 600 x 400 diagonal
gratings `0.5 + 0.4 sin(2 pi f . (x, y))`. Each interior output pixel is compared
with the grating at the source point the warp names (the module's reference
formula, checked against the specification in `tests/test_dng_warp.py`).

| cycles/px | bilinear RMS | cubic RMS | cubic / bilinear |
|---:|---:|---:|---:|
| 0.02 | 0.000384 | 0.000004 | 0.010 |
| 0.05 | 0.002390 | 0.000060 | 0.025 |
| 0.10 | 0.009460 | 0.000555 | 0.059 |
| 0.15 | 0.020923 | 0.002208 | 0.106 |
| 0.20 | 0.036316 | 0.006057 | 0.167 |
| 0.25 | 0.055026 | 0.013304 | 0.242 |
| 0.30 | 0.076323 | 0.025069 | 0.328 |
| 0.35 | 0.099406 | 0.042137 | 0.424 |
| 0.40 | 0.123443 | 0.064719 | 0.524 |

Cubic is 2 to 100 times closer at every frequency, most at the low and middle
ones where most image content sits. At 0.25 cycles/px (detail four pixels
across) bilinear's error is 5.5% of full scale on a 40%-amplitude pattern;
cubic's is 1.3%.

## 2. The real frame

Leica T DNG, numpy engine, full size (4928 x 3264), this container:

| render | time | mean abs Laplacian, 8-bit green |
|---|---:|---:|
| no warp | 1.69 s | 3.471 |
| bilinear warp | 7.40 s | 2.542 (73%) |
| cubic warp | 16.24 s | 3.097 (89%) |

Bilinear sampling at a fractional offset is a small blur, and on this frame it
removes 27% of the fine detail the unwarped render has. Cubic removes 11%
(part of that is the warp's own magnification, about 3% at the corners, which
spreads detail over more pixels). The two warped renders differ by a mean of
0.19 of an 8-bit step, 2 steps at the 99.9th percentile, and up to 20 on the
sharpest edges.

The warp's cost about doubles (5.7 s to 14.6 s on top of the develop). That is
why bilinear stays the default for now. A faster cubic (separable passes, or
float32) would make it worth switching, which is the next step.

## Reproduce

    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/Leica%20T%20(Typ%20701).dng"
    python3 tools/warp_kernel_check.py "Leica T (Typ 701).dng"
