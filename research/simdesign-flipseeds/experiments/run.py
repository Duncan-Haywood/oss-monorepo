"""Flip rate across 20 seeds (5..24, disjoint from coverweight's 0..4) and budgets. Writes results.txt."""
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from simdesign_flipseeds import flip_stats  # noqa: E402

SEEDS = range(5, 25)
out = [f"# flip rate of the exhaustive machine choice, count vs mass weighting; {len(SEEDS)} seeds (5..24), n=20000 parts per seed, with tip load",
       "# flips = seeds where the two weightings pick different machine sets; ci = 95% Wilson; loss = mass coverage given up by using the count-weighted pick (points)"]
for kind in ("log", "small", "large"):
    out.append(f"## family '{kind}'")
    for b in (300, 600, 700, 800, 900, 1100, 1400):
        r = flip_stats(kind, b, SEEDS)
        loss = np.array(r["loss"]) * 100
        top = sorted(r["pairs"].items(), key=lambda kv: -kv[1])[:3]
        pairs = "; ".join(f"count {list(a)} / mass {list(m)} x{c}" for (a, m), c in top)
        out.append(f"  budget {b:5d}: flips {r['flips']:2d}/{r['n']}  ci [{r['ci'][0]:.2f}, {r['ci'][1]:.2f}]  loss mean {loss.mean():.2f} max {loss.max():.2f}  | {pairs}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
