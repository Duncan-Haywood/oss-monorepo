"""Demographic accounting helpers (milestone 5)."""
import numpy as np


def raised_share(p, rho):
    """Share of children raised Catholic when a share p of mothers is Catholic and Catholic mothers have rho times
    the completed fertility of the rest (children raised in the mother's religion)."""
    p, rho = np.asarray(p, float), np.asarray(rho, float)
    return p * rho / (p * rho + 1 - p)


def equal_fertility_share(R, rho):
    """Invert raised_share: the share raised Catholic had Catholic and other mothers had equal fertility (= p)."""
    R, rho = np.asarray(R, float), np.asarray(rho, float)
    return R / (R + rho * (1 - R))
