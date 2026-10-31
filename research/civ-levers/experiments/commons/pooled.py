"""Pooled sanctioning institution against peer punishment, large stranger groups."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
import numpy as np
from civ_levers.commons import play

SEEDS = 30
out = []
for n in (8, 16, 40):
    for name, kw in (("none", {}), ("peer", dict(punish=True)), ("pooled", dict(punish=True, pooled=True))):
        for rc in ((0.0,) if name == "none" else (0.5, 1.0, 2.0)):
            c, p = [], []
            for s in range(SEEDS):
                a, b = play(240, n, 10, np.random.default_rng(s), stranger=True, react=rc, **kw)
                c.append(a[-1]); p.append(b[-1])
            c, p = np.array(c), np.array(p)
            h = lambda x: 1.96 * x.std(ddof=1) / np.sqrt(SEEDS)
            out.append(f"n{n:<3d} {name:6s} react {rc:3.1f}  contrib r10 {c.mean():5.2f} (+-{h(c):.2f})  payoff r10 {p.mean():5.2f} (+-{h(p):.2f})")
open(os.path.join(os.path.dirname(__file__), "pooled_results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
