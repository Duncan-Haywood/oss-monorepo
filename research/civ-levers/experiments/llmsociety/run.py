"""Does civ-levers' ranking of levers survive 7-point opinions and decision noise?
Stub policy only (no language model is called). 10 societies per cell, top dose."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import numpy as np
from civ_levers.llmsociety import outcome

LEVERS = ["bridge", "broadcast", "moderates", "ladder", "nudge", "tolerance"]
DOSE = {"bridge": 0.25, "broadcast": 0.3, "moderates": 0.2, "ladder": 0.2, "nudge": 0.3, "tolerance": 0.1}
SEEDS = 10
print("merged = gap < 0.1 (continuous civ-levers rule); counts of 10 societies, eps 0.3, tau none")
print(f"{'noise':>6} " + " ".join(f"{l:>10}" for l in ["none"] + LEVERS))
for noise in (0.0, 0.05, 0.2):
    row = []
    for lever in ["none"] + LEVERS:
        d = DOSE.get(lever, 0.0)
        m = sum(outcome(lever, d, 0.3, np.inf, noise, s)["gap"] < 0.1 for s in range(SEEDS))
        row.append(m)
    print(f"{noise:>6} " + " ".join(f"{m:>10}" for m in row), flush=True)
print("\nsame at eps 0.2 (rejection tau 0.7)")
for noise in (0.0, 0.2):
    row = []
    for lever in ["none"] + LEVERS:
        d = DOSE.get(lever, 0.0)
        m = sum(outcome(lever, d, 0.2, 0.7, noise, s)["gap"] < 0.1 for s in range(SEEDS))
        row.append(m)
    print(f"{noise:>6} " + " ".join(f"{m:>10}" for m in row), flush=True)
