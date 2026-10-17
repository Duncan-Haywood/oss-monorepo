"""Stylised Cunniff-style comparison of protective fibres.

Not a ballistic model. At equal areal density and threat, V50 is taken to scale
with the Cunniff velocity U* (see README for the caveat that this form is recalled,
not checked against the print-only source). Material numbers are assumed round
figures, not datasheet values.
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Fibre:
    name: str
    strength: float      # tensile strength, Pa (assumed)
    strain: float        # failure strain, - (assumed)
    modulus: float       # Pa (assumed)
    density: float       # kg/m3 (assumed)
    price_per_kg: float  # USD/kg of fabric (assumed, unsourced placeholder)
    packing: float = 0.55  # fibre volume fraction in the fabric stack (assumed)


FIBRES = [
    Fibre("nylon 6,6", 0.9e9, 0.20, 5e9, 1140, 8.0),
    Fibre("aramid", 3.0e9, 0.024, 90e9, 1440, 40.0),
    Fibre("UHMWPE", 3.4e9, 0.035, 110e9, 970, 60.0),
]


def u_star(f: Fibre) -> float:
    """Cunniff velocity U* = [ (sigma*eps / 2 rho) * sqrt(E / rho) ]^(1/3), m/s."""
    return ((f.strength * f.strain / (2 * f.density)) * math.sqrt(f.modulus / f.density)) ** (1 / 3)


def v50_ratio(f: Fibre, ref: Fibre) -> float:
    """V50 of f over V50 of ref at equal areal density (V50 proportional to U*)."""
    return u_star(f) / u_star(ref)


def areal_density_ratio(f: Fibre, ref: Fibre, n: float) -> float:
    """Areal density f needs to match ref's V50, assuming V50/U* ~ (Ad)^n."""
    if n <= 0:
        raise ValueError("n must be positive")
    return (u_star(ref) / u_star(f)) ** (1 / n)


def thickness(f: Fibre, areal_density: float) -> float:
    """Stack thickness in m for areal density in kg/m2."""
    return areal_density / (f.density * f.packing)


def bending_stiffness(f: Fibre, areal_density: float, plies: int, bonded: bool) -> float:
    """Bending stiffness per unit width, N*m. Bonded: one beam; free: plies sliding."""
    t = thickness(f, areal_density)
    ef = f.modulus * f.packing  # crude stack modulus along the fibre
    if bonded:
        return ef * t**3 / 12
    return plies * ef * (t / plies) ** 3 / 12


def garment(f: Fibre, areal_density: float, area: float) -> dict:
    return {"mass_kg": areal_density * area, "cost_usd": areal_density * area * f.price_per_kg,
            "thickness_mm": 1e3 * thickness(f, areal_density)}
