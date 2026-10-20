"""Detection power of a classifier two-sample test (C2ST) against wrong pendulum twins, by sample size.

Reuses the pendulum, twins and C2ST of `research/mimic-twinregret/twin.py` (imported, not copied). Stylised, simulated.
"""
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mimic-twinregret"))
import twin  # noqa: E402

R = twin.REAL


def auroc_once(cfg, n, seed):
    """C2ST AUROC with n real and n twin trajectories, one replicate."""
    rng = np.random.default_rng(seed)
    _, _, real = twin.passive(rng, n, R)
    _, _, tw = twin.passive(rng, n, cfg)
    return twin.c2st(real, tw, seed=seed)


def null_threshold(aurocs, alpha=0.05):
    """Empirical (1 - alpha) quantile of the null AUROCs (exact twin), the rejection threshold."""
    return float(np.quantile(np.asarray(aurocs), 1 - alpha))


def power(aurocs, thr):
    """Share of replicates whose AUROC exceeds the null threshold."""
    return float((np.asarray(aurocs) > thr).mean())


def n_needed(ns, powers, target=0.8):
    """Smallest n whose power reaches the target, or None if none does."""
    for n, p in zip(ns, powers):
        if p >= target:
            return n
    return None
