"""Horowitz (2014) Fig. 1.1.9, "Rough energy costs for various operations in 45nm 0.9V".

Transcribed by reading the figure itself (page 14 of the ISSCC 2014 paper, DOI
10.1109/ISSCC.2014.6757323, copy at https://gwern.net/doc/cs/hardware/2014-horowitz-2.pdf), not
from a secondary source. The memory column is per 64-bit access.
"""
import math

ADD_INT_PJ = {8: 0.03, 32: 0.1}
MULT_INT_PJ = {8: 0.2, 32: 3.1}
FADD_PJ = {16: 0.4, 32: 0.9}
FMULT_PJ = {16: 1.1, 32: 3.7}
CACHE_64B_PJ = {8 * 1024: 10.0, 32 * 1024: 20.0, 1024 * 1024: 100.0}   # bytes -> pJ per 64-bit access
DRAM_PJ = (1300.0, 2600.0)


def loglog_exponent(points):
    """Slope of log(energy) against log(x) between the first and last of a dict of two or more points."""
    xs = sorted(points)
    return math.log(points[xs[-1]] / points[xs[0]]) / math.log(xs[-1] / xs[0])


def interp(points, x):
    """Piecewise log-log interpolation through the points; outside the range, extend the end segment."""
    xs = sorted(points)
    if x <= xs[0]:
        a, b = xs[0], xs[1]
    elif x >= xs[-1]:
        a, b = xs[-2], xs[-1]
    else:
        a = max(v for v in xs if v <= x)
        b = min(v for v in xs if v >= x)
        if a == b:
            return points[a]
    s = math.log(points[b] / points[a]) / math.log(b / a)
    return points[a] * (x / a) ** s


def sram_pj_per_bit(size_bytes, mode="paper"):
    """Read energy per bit of an on-chip array of size_bytes.

    paper: log-log interpolation through Fig. 1.1.9 (8 KB, 32 KB, 1 MB); below 8 KB it extends the
           8 to 32 KB segment downward, which is an extrapolation the paper does not make.
    floor: no cheaper than the 8 KB point (the repository's own 0.16 pJ/bit), above it as 'paper'.
    """
    pj64 = interp(CACHE_64B_PJ, size_bytes)
    if mode == "floor":
        pj64 = max(pj64, CACHE_64B_PJ[8 * 1024])
    return pj64 / 64.0
