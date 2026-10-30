"""Milestone 2h: where, in (OC neutral pressure p_n, LS standby flow q_sb), does LS/OC cross 1 at the measured load factor?

Reuses 2g's `ratio` (same cycles, margins and idle draws). For each q_sb, bisect p_n for LS/OC median = 1.
p_n and q_sb are ASSUMED axes (swept); the output says which datasheet values would decide the ranking.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from idle_models import ratio

def pn_star(lf, q_sb, lo=0.0, hi=60.0):
    f = lambda p: ratio(lf, p, q_sb, n_per_seed=300)[0] - 1.0
    if f(lo) < 0: return 0.0           # LS wins even at 0 bar neutral
    if f(hi) > 0: return None          # LS loses even at hi bar neutral
    for _ in range(12):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) > 0 else (lo, mid)
    return (lo + hi) / 2

if __name__ == "__main__":
    print("p_n* (bar) above which load-sensing beats open-centre in median shaft energy (LS/OC<1); 1,500 cycles per evaluation")
    for lf in (0.346, 0.375, 0.5):
        print(f"\nload factor {lf}")
        for q in (0, 1, 2, 4, 6, 8):
            p = pn_star(lf, float(q))
            print(f"  q_sb {q} L/min: p_n* = {'LS loses up to 60 bar' if p is None else f'{p:.1f}'}")
