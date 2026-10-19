"""Cost per wear (CPW) of a garment: (price - resale value) / lifetime wears + care cost per wear.

Lifetime is the number of wears before the garment is retired. A replacement is bought at the same
price, so over a long horizon the cost per wear of a garment line is the CPW of one garment.
All inputs are assumptions supplied by the caller.
"""
import numpy as np

__all__ = ["cpw", "breakeven_ratio", "lognormal_wears", "prob_designer_cheaper"]


def cpw(price, wears, resale_frac=0.0, care_per_wear=0.0):
    """Cost per wear: net purchase cost spread over `wears`, plus care per wear."""
    wears = np.asarray(wears, dtype=float)
    return price * (1.0 - resale_frac) / wears + care_per_wear


def breakeven_ratio(p_designer, p_replica, resale_designer=0.0, resale_replica=0.0,
                    care_designer=0.0, care_replica=0.0, wears_replica=1.0):
    """Lifetime multiple L_d / L_r at which the designer piece matches the replica's CPW.

    Solves  Pd(1-rd)/Ld + cd = Pr(1-rr)/Lr + cr  for Ld/Lr at the given replica lifetime.
    Returns inf if the designer's care cost per wear is at least the replica's total CPW
    (no lifetime can then make it cheaper).
    """
    target = p_replica * (1.0 - resale_replica) / wears_replica + care_replica - care_designer
    if target <= 0:
        return float("inf")
    return p_designer * (1.0 - resale_designer) / target / wears_replica


def lognormal_wears(median, sigma, n, rng):
    """Draw n lifetimes (wears) from a lognormal with the given median and log-sd."""
    return median * np.exp(sigma * rng.standard_normal(n))


def prob_designer_cheaper(p_designer, p_replica, med_d, med_r, sigma=0.5, n=20000, seed=0, **kw):
    """P(CPW_designer < CPW_replica) with independent lognormal lifetimes. kw: resale_/care_ args
    named resale_designer, resale_replica, care_designer, care_replica."""
    rng = np.random.default_rng(seed)
    ld = lognormal_wears(med_d, sigma, n, rng)
    lr = lognormal_wears(med_r, sigma, n, rng)
    cd = cpw(p_designer, ld, kw.get("resale_designer", 0.0), kw.get("care_designer", 0.0))
    cr = cpw(p_replica, lr, kw.get("resale_replica", 0.0), kw.get("care_replica", 0.0))
    return float(np.mean(cd < cr))
