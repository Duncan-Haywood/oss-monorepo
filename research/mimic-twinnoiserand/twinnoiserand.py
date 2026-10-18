"""Domain randomization over the noise level only: does it keep the rescue of `mimic-twinrand` without its blow-up?

Builds on `research/mimic-twinrand/twinrand.py` (imported, not copied). Stylised and simulated: no real data.
"""
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mimic-twinrand"))
import twinrand

twin = twinrand.twin
REAL = twinrand.REAL
SCALE = twinrand.SCALE


def draw_twin_noise(nominal, width, rng):
    """Randomize only sd: uniform on nominal +- width * SCALE['sd'], clipped at 0. Other parameters stay nominal."""
    p = dict(nominal)
    p["sd"] = max(nominal["sd"] + width * SCALE["sd"] * rng.uniform(-1.0, 1.0), 0.0)
    return p


def tune_noise_dr(nominal, width, rng, n=200, k=8, gains=None):
    """Same budget and structure as `twinrand.tune_dr` (k twins, n // k start angles each), noise level only."""
    gains = gains or twin.gain_grid()
    total = np.zeros(len(gains))
    for _ in range(k):
        p = draw_twin_noise(nominal, width, rng)
        th0 = rng.uniform(-2.0, 2.0, n // k)
        total += twin.closed_loop_cost(th0, gains, p, rng)
    return int(np.argmin(total)), gains
