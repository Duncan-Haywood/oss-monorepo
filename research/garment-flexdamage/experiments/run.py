"""Experiments for garment-flexdamage. Seeded; writes experiments/results.txt."""
import os, sys
import numpy as np
here = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(here, "..", "src"))
from garment_flexdamage.model import *

out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

N, DRAWS = 24, 60
rng = np.random.default_rng(123)
def cell(f, rc, **kw):
    m, lo, hi, nop = median_ci(sample(N, f, rc, DRAWS, 0, **kw), rng)
    return f"{m:7.2f} [{lo:6.2f},{hi:7.2f}]" + (f" ({nop} open)" if nop else "")

P(f"Median effective sheet resistance (segment units), {N}x{N} fabric, {DRAWS} draws per cell, seed 0, 95% bootstrap interval of the median.")
P("'open' = draws with no path between the bus bars (excluded from the median).\n")

P("A. Worn contacts: contacts touching a broken segment have rc*k. Base rc = 1 segment. Independent breaks.")
KS = (1.0, 3.0, 10.0, 30.0)
P(f"{'break f':>8s} " + " ".join(f"{'k=' + str(k):>26s}" for k in KS))
for f in (0.1, 0.2, 0.3):
    P(f"{f:8.2f} " + " ".join(f"{cell(f, 1.0, k=k):>26s}" for k in KS))

P("\nB. Same, base rc = 0.1 segment (good contacts that wear badly).")
P(f"{'break f':>8s} " + " ".join(f"{'k=' + str(k):>26s}" for k in KS))
for f in (0.1, 0.2, 0.3):
    P(f"{f:8.2f} " + " ".join(f"{cell(f, 0.1, k=k):>26s}" for k in KS))

P("\nC. Fold band: 20% of the fabric breaks conc times more often; mean break fraction held at f. Contacts rc = 1, k = 1.")
CS = (1.0, 2.0, 4.0)
for orient in ("across", "along"):
    P(f"fold {orient} the current direction")
    P(f"{'break f':>8s} " + " ".join(f"{'conc=' + str(c):>26s}" for c in CS))
    for f in (0.1, 0.2, 0.3):
        P(f"{f:8.2f} " + " ".join(f"{cell(f, 1.0, conc=c, orient=orient):>26s}" for c in CS))

P("\nD. Ideal contacts (rc = 0): the same folds with no contact effect, to separate the two mechanisms.")
for orient in ("across", "along"):
    P(f"fold {orient}")
    P(f"{'break f':>8s} " + " ".join(f"{'conc=' + str(c):>26s}" for c in CS))
    for f in (0.1, 0.2, 0.3):
        P(f"{f:8.2f} " + " ".join(f"{cell(f, 0.0, conc=c, orient=orient):>26s}" for c in CS))

open(os.path.join(here, "results.txt"), "w").write("\n".join(out) + "\n")
