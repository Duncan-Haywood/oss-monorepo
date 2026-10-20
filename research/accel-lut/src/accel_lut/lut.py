"""Weight sharing (k-means codebook) and an energy model for product-table inference.

Idea used, not reproduced: weight sharing with a small codebook (Han, Mao and Dally 2016,
"Deep Compression", ICLR; here plain 1-D Lloyd k-means, post-training, no retraining).
Every energy constant is an ASSUMPTION; the first four are reused from research/accel-sparse
(45 nm orders of magnitude in the spirit of Horowitz 2014, not re-checked against the paper).
"""
import math
import numpy as np

E_MULT_8X8_PJ = 0.2       # 8x8 multiply, scaled by (abits*wbits)/64
E_ADD_PJ_24 = 0.075       # 24-bit accumulate
E_READ_PJ_PER_BIT = 0.16  # weight / activation array read, per bit
PROD_BITS = 16            # width of a stored product a*c


def share_weights(w, mask, k, iters=30):
    """1-D k-means over the unmasked weights of one layer. Returns (wq, codebook).
    Masked-out (pruned) weights stay exactly 0 and do not use a codebook entry."""
    v = w[mask > 0]
    if v.size == 0:
        return np.zeros_like(w), np.zeros(0)
    k = min(k, np.unique(v).size)
    c = np.quantile(v, (np.arange(k) + 0.5) / k)
    for _ in range(iters):
        a = np.argmin(np.abs(v[:, None] - c[None]), 1)
        for j in range(k):
            if np.any(a == j):
                c[j] = v[a == j].mean()
    a = np.argmin(np.abs(v[:, None] - c[None]), 1)
    wq = np.zeros_like(w)
    wq[mask > 0] = c[a]
    return wq, c


def energy_mac_pj(fan_in, fan_out, nnz, wbits, abits, sparse, act_once):
    """Serial MAC engine as in accel-sparse. act_once=False reads the activation for every weight
    (accel-sparse's convention); True reads it once per input (activation held in a register)."""
    idx = math.ceil(math.log2(fan_in)) if sparse else 0
    n = nnz if sparse else fan_in * fan_out
    act_reads = fan_in if act_once else n
    read = n * (wbits + idx) * E_READ_PJ_PER_BIT + act_reads * abits * E_READ_PJ_PER_BIT
    return read + n * (E_MULT_8X8_PJ * wbits * abits / 64.0 + E_ADD_PJ_24)


def energy_lut_pj(fan_in, fan_out, nnz, k, abits, sparse, e_tbl_bit):
    """Product-table engine: for each input, form the K products a*c_j once (K multiplies, written
    to a small PROD_BITS-wide table); then every nonzero weight is an index read, a table read and
    an add, with no multiplier. The activation is read once per input."""
    idx = math.ceil(math.log2(fan_in)) if sparse else 0
    n = nnz if sparse else fan_in * fan_out
    kb = max(1, math.ceil(math.log2(k)))
    mults = fan_in * k * E_MULT_8X8_PJ * abits * 8 / 64.0
    tbl_write = fan_in * k * PROD_BITS * e_tbl_bit
    per_w = (kb + idx) * E_READ_PJ_PER_BIT + PROD_BITS * e_tbl_bit + E_ADD_PJ_24
    return fan_in * abits * E_READ_PJ_PER_BIT + mults + tbl_write + n * per_w
