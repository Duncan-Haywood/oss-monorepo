"""Flip rate vs budget under +-20% independent price perturbation. Writes results.txt."""
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from simdesign_pricebands import BASE, flip_rate, price_draws, subset_values  # noqa: E402

SEEDS = range(5, 13)  # 8 part samples of 20000 (a subset of flipseeds' 5..24)
BUDGETS = range(300, 1501, 100)
M = 400
out = [f"# flip rate of the exhaustive machine choice (count vs mass weighting) when the 3 machine prices are each scaled by independent U(1-s, 1+s); nominal {BASE.tolist()}",
       f"# {len(SEEDS)} part samples (seeds 5..12, n=20000, tip load) x {M} price draws per sample (draw seed 0, shared across samples and budgets)",
       "# any = share of (sample, draw) pairs where the two weightings pick different sets; mat = share where the count pick gives up > 0.5 points of mass coverage"]
for kind in ("log", "large", "small"):
    vals = [subset_values(kind, s) for s in SEEDS]
    out.append(f"## family '{kind}'")
    for spread in (0.0, 0.1, 0.2):
        prices = price_draws(M if spread else 1, spread, np.random.default_rng(0))
        row = []
        for b in BUDGETS:
            r = np.array([flip_rate(v, prices, b) for v in vals])
            row.append(f"{b}:{r[:,0].mean():.2f}/{r[:,1].mean():.2f}")
        out.append(f"  spread {spread:.1f}  budget:any/mat  " + "  ".join(row))
    # width of the flipping budget band at nominal vs perturbed (material flip share >= 0.5)
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
