"""Domain randomization over a wrong digital twin: does tuning on a spread of twins cut the regret of tuning on one?

Builds on `research/mimic-twinregret/twin.py` (same pendulum, noise models, PD task and cost); that module is imported,
not copied. Everything is stylised and simulated: no real data.
"""
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mimic-twinregret"))
import twin

REAL = twin.REAL
SCALE = dict(sd=0.02, coul=0.3, visc=0.1, glo=9.81)   # one "unit" of randomization width per parameter (the real values)


def draw_twin(nominal, width, rng):
    """One randomized twin: each parameter uniform on nominal +- width * SCALE, clipped at 0 (and at 0.1 for g/L)."""
    p = dict(nominal)
    for k, s in SCALE.items():
        v = nominal[k] + width * s * rng.uniform(-1.0, 1.0)
        p[k] = max(v, 0.1 if k == "glo" else 0.0)
    return p


def tune_dr(nominal, width, rng, n=200, k=8, gains=None):
    """Grid-search the PD gains on the mean cost over k randomized twins, n // k fresh start angles each.

    The simulation budget (n start angles) matches `twin.tune`. width = 0 is the single nominal twin with k
    independent start-angle batches, so the comparison changes only the spread of twins, not the budget.
    """
    gains = gains or twin.gain_grid()
    total = np.zeros(len(gains))
    for _ in range(k):
        p = draw_twin(nominal, width, rng)
        th0 = rng.uniform(-2.0, 2.0, n // k)
        total += twin.closed_loop_cost(th0, gains, p, rng)
    return int(np.argmin(total)), gains
