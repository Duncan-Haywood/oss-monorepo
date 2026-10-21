"""Energy of int8 MAC and product-table engines when every array's read energy depends on its size.

Imports the accel-lut energy functions (constants, multiplier, adder) and the Horowitz (2014)
Fig. 1.1.9 array-size law from accel-horowitzcheck; only the read term is re-done here.
Array read energy per bit: e(size) = E_8KB * (size / 8 KB) ** alpha, with E_8KB = 10 pJ / 64 bit
(Horowitz's 8 KB cache point). alpha = 0 is the repository's flat 0.16 pJ/bit; the paper's 8 to 32 KB
slope is about 0.5, but the paper has no point below 8 KB, so alpha is swept, not chosen.
"""
import math
import os
import sys

HERE = os.path.dirname(__file__)
for p in ("accel-lut/src", "accel-horowitzcheck/src"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p))
from accel_lut import lut as L  # noqa: E402
from accel_horowitzcheck import horowitz as H  # noqa: E402

E_8KB_PJ_PER_BIT = H.CACHE_64B_PJ[8 * 1024] / 64.0   # 0.15625, rounds to the repository's 0.16
KB8 = 8 * 1024


def e_bit(size_bits, alpha, floor=False):
    """Read energy per bit of an array of size_bits. floor=True never goes below the 8 KB point."""
    size_bytes = max(size_bits / 8.0, 1.0)
    f = (size_bytes / KB8) ** alpha
    if floor:
        f = max(f, 1.0)
    return E_8KB_PJ_PER_BIT * f


def mac_pj(fan_in, fan_out, nnz, wbits, abits, sparse, alpha, floor=False):
    """int8 serial MAC engine, activation read once per input (accel-lut's like-with-like baseline)."""
    idx = math.ceil(math.log2(fan_in)) if sparse else 0
    n = nnz if sparse else fan_in * fan_out
    e_w = e_bit(n * (wbits + idx), alpha, floor)
    e_a = e_bit(fan_in * abits, alpha, floor)
    return n * (wbits + idx) * e_w + fan_in * abits * e_a + n * (L.E_MULT_8X8_PJ * wbits * abits / 64.0 + L.E_ADD_PJ_24)


def lut_pj(fan_in, fan_out, nnz, k, abits, sparse, alpha, floor=False):
    """Product-table engine: index array, K-entry table and activation buffer each priced by size."""
    idx = math.ceil(math.log2(fan_in)) if sparse else 0
    n = nnz if sparse else fan_in * fan_out
    kb = max(1, math.ceil(math.log2(k)))
    e_i = e_bit(n * (kb + idx), alpha, floor)
    e_t = e_bit(k * L.PROD_BITS, alpha, floor)
    e_a = e_bit(fan_in * abits, alpha, floor)
    mults = fan_in * k * L.E_MULT_8X8_PJ * abits * 8 / 64.0
    tbl_write = fan_in * k * L.PROD_BITS * e_t
    per_w = (kb + idx) * e_i + L.PROD_BITS * e_t + L.E_ADD_PJ_24
    return fan_in * abits * e_a + mults + tbl_write + n * per_w
