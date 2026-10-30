"""Milestone 2i: with the open-centre neutral pressure p_n read from a published valve curve, who wins at idle?

p_n comes from the Salami VD8A sectional-valve catalogue (E0.06.0911.02.02, p. 7, "Pressure drop P to T"): the text
gives "approximatively 1 bar for each spool at nominal flow" (75 L/min), and the curve for 8 spools reads about 12.7 bar
at 90 L/min (a reading off a figure, about +-0.5 bar). Drop scales as Q^2. Bracket A: n bar-per-section from the text
(n * (Q/75)^2); bracket B: the 8-spool curve scaled by sections (12.7 * (n/8) * (Q/90)^2). Valve only: return line,
filter and cooler are not in the catalogue, so `extra` bar (0, 2, 5; ASSUMED) is added on top.
Reuses 2g's `ratio` (same cycles, margins, idle draws); the load factor is the measured 0.346.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from idle_models import ratio, pc

Q = pc.Q_PUMP

def p_n_text(n, q=Q):
    return n * (q / 75.0) ** 2

def p_n_curve(n, q=Q):
    return 12.7 * (n / 8.0) * (q / 90.0) ** 2

if __name__ == "__main__":
    print(f"pump flow {Q} L/min; LS standby 2 L/min; load factor 0.346; 3,000 cycles per cell")
    print("sections | bracket | valve p_n | +extra bar -> LS/OC median (5-95%) | share LS>OC")
    for n in (3, 4, 6, 8):
        for name, f in (("text", p_n_text), ("curve", p_n_curve)):
            for extra in (0.0, 2.0, 5.0):
                p = f(n) + extra
                m, lo, hi, w = ratio(0.346, p, 2.0, n_per_seed=600)
                print(f"{n:>3} | {name:>5} | {f(n):4.2f} | +{extra:g} -> p_n {p:5.2f}: {m:.3f} ({lo:.3f} to {hi:.3f}) | {w:5.1f}%")
