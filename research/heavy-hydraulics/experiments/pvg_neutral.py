"""Milestone 2n: the open-centre neutral drop from Danfoss's PVG 32 bypass curve, and who wins at idle.

Danfoss PVG 32 Technical Information (BC152886483664, May 2021), p. 16, "pressure drop, bypass in neutral" of the
open-centre PVP: about 8.5 bar at ~0 flow rising linearly to about 16 bar at 140 L/min (figure reading, +-0.5 bar).
p_n at the model pump flow (45 L/min) is read off that line. LS standby 2 L/min is ASSUMED. Reuses 2g's `ratio`.

    python3 experiments/pvg_neutral.py > experiments/pvg_neutral_results.txt
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import physics_cycle as pc
from idle_models import ratio
from ranking_map import crossing

DPLS = tuple(range(10, 42, 2))


def p_n(q, a=8.5, b=16.0, qmax=140.0):
    return a + (b - a) * q / qmax


if __name__ == "__main__":
    print(f"load factor 0.346; LS standby 2 L/min; 3,000 cycles per cell; pump {pc.Q_PUMP:g} L/min")
    for label, a, b in (("reading", 8.5, 16.0), ("low", 8.0, 15.5), ("high", 9.0, 16.5)):
        p = p_n(pc.Q_PUMP, a, b)
        ys = [ratio(0.346, p, 2.0, n_per_seed=600, dp_ls=float(d))[0] for d in DPLS]
        x = crossing(DPLS, ys)
        mono = all(y1 >= y0 - 1e-9 for y0, y1 in zip(ys, ys[1:]))
        print(f"\n{label}: p_n {p:.2f} bar; monotone={mono}; break-even dp_ls = " + (f"{x:.1f} bar" if x else "none in range"))
        print("  " + " ".join(f"{d}:{y:.3f}" for d, y in zip(DPLS, ys)))
        if label == "reading":
            for d in (14.0, 20.0, 25.0):
                m, lo, hi, w = ratio(0.346, p, 2.0, n_per_seed=600, dp_ls=d)
                print(f"  dp_ls {d:g}: LS/OC median {m:.3f} ({lo:.3f} to {hi:.3f}); LS worse in {w:.1f}% of cycles")
