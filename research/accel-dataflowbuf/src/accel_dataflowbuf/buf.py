"""Bounded activation buffer for the accel-dataflow schedules (stylised).

Reuses accel_dataflow's schedules. An activation (b, i) on the broadcast bus is free if it was on the bus in the
previous cycle (accel-dataflow's one-cycle register). Otherwise it is looked up in a K-entry LRU buffer: a hit costs a
buffer read, a miss costs an SRAM read and fills the buffer. K = 0 reproduces accel-dataflow's x_rd exactly.
"""
import os, sys
from collections import OrderedDict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "accel-dataflow", "src"))
from accel_dataflow import flows as F, cost as C   # noqa: E402,F401

_cache = {}


def x_counts(df, O, I, B, P, K):
    """(sram_x_reads, buffer_x_reads) for a K-entry LRU activation buffer. Pure function of the activation trace."""
    key = (df, O, I, B, P, K)
    if key in _cache:
        return _cache[key]
    prev, buf, miss, hit = set(), OrderedDict(), 0, 0
    for ops in F.schedule(df, O, I, B, P):
        xs = {(b, i) for _, _, i, b in ops}
        for x in xs - prev:
            if x in buf:
                buf.move_to_end(x); hit += 1
            else:
                miss += 1
                if K > 0:
                    buf[x] = 1
                    if len(buf) > K:
                        buf.popitem(last=False)
        prev = xs
    _cache[key] = (miss, hit)
    return _cache[key]


def energy_nj(m, df, P, B, K, rb_ratio=0.1):
    """Energy per inference (nJ). rb_ratio = buffer-read energy per bit as a fraction of SRAM's (ASSUMED)."""
    e = 0.0
    for O, I in C.layers(m):
        c, _ = F.simulate(df, O, I, B, P)
        miss, hit = x_counts(df, O, I, B, P, K)
        c = dict(c, x_rd=miss)
        e += C.energy_pj(c, m["wbits"]) + C.E_SRAM_PJ_PER_BIT * rb_ratio * hit * C.ACT_BITS
    return e / B / 1000
