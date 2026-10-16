"""Is the raw-MMD blind spot a bandwidth artefact? MMD on raw trajectories, bandwidth = median heuristic x scale.

    python experiments/bandwidth.py      # about a minute; writes bandwidth.txt
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import mmd

N, REPS = 200, 100
SCALES = (1.0, 0.3, 0.1, 0.03)
TWINS = {"null": mmd.REAL, "coul-10%": dict(mmd.REAL, coul=0.27), "coul-20%": dict(mmd.REAL, coul=0.24)}


def med(z):
    d = mmd._sqdist(z, z)
    return float(np.sqrt(np.median(d[np.triu_indices(len(z), 1)])))


out = [f"Raw-trajectory MMD, n={N} per class, {REPS} replicates, power at the 5% null-calibrated level (Wilson 95%). Real system {mmd.REAL}."]
for s in SCALES:
    vals = {k: [] for k in TWINS}
    for k, cfg in TWINS.items():
        for r in range(REPS):
            rng = np.random.default_rng(7919 * r + N)
            a, b = mmd.sample(rng, N, **mmd.REAL), mmd.sample(rng, N, **cfg)
            vals[k].append(mmd.mmd2(a, b, s * med(np.vstack([a, b]))))
    thr = mmd.threshold(vals["null"])
    cells = "  ".join(f"{k} {mmd.power(vals[k], thr)[0]:.2f}" for k in ("coul-10%", "coul-20%"))
    out.append(f"bandwidth x{s:<5} {cells}")
(HERE / "bandwidth.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
