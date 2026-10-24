"""Tiny Tapeout integer contract applied to trained accel-kws models: limit checks and a wrapping reference."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "accel-kws", "src"))
from accel_kws import model  # noqa: E402,F401

ACCW, BIASW = 20, 16


def wrap(v, bits=ACCW):
    """Two's-complement wraparound, what a `bits`-wide register does."""
    m = 1 << bits
    return ((np.asarray(v, dtype=np.int64) + (m >> 1)) % m) - (m >> 1)


def stats(m, xq):
    """Largest magnitudes a model reaches on xq, against the tile's limits (|bias| < 2^15, |acc| < 2^19)."""
    a1 = xq @ m.w1.T.astype(np.int64) + m.b1
    h = np.clip(a1 >> m.s1, 0, 255)
    a2 = h @ m.w2.T.astype(np.int64) + m.b2
    return dict(max_b1=int(np.abs(m.b1).max()), max_b2=int(np.abs(m.b2).max()),
                max_a1=int(np.abs(a1).max()), max_a2=int(np.abs(a2).max()),
                n_a1_over=int((np.abs(a1) >= 1 << (ACCW - 1)).sum()), n_a2_over=int((np.abs(a2) >= 1 << (ACCW - 1)).sum()))


def fits(s):
    return s["max_b1"] < 1 << (BIASW - 1) and s["max_b2"] < 1 << (BIASW - 1) and s["max_a1"] < 1 << (ACCW - 1) and s["max_a2"] < 1 << (ACCW - 1)


def tile_model(m):
    """The model as the tile receives it: biases clipped to signed 16 bits (the host cannot send more)."""
    lim = (1 << (BIASW - 1)) - 1
    return model.IntModel(m.w1, np.clip(m.b1, -lim, lim), m.w2, np.clip(m.b2, -lim, lim), m.s1, m.wbits, m.mean, m.std)


def tile_forward(m, xq):
    """Integer contract of rtl/kws_tt.v: biases already 16-bit, 20-bit wrapping accumulators. Returns (logits, hidden)."""
    a1 = wrap(xq @ m.w1.T.astype(np.int64) + m.b1)
    h = np.clip(a1 >> m.s1, 0, 255)
    return wrap(h @ m.w2.T.astype(np.int64) + m.b2), h
