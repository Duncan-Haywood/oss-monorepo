"""Volumetric ceilings (Wh per litre) for electrochemical couples and stores.

Builds on `energy-density` (same couples, voltages and atomic weights): the reactant volume is the
sum of mass / density over the reactants, so the result is a ceiling for the active material only,
with no pores, electrolyte, binder, casing or gaps. Densities are handbook values from memory,
marked `assumed` below; none was checked against a primary source in this run.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_SIB = os.path.normpath(os.path.join(_HERE, "..", "..", "..", "energy-density", "src"))
if _SIB not in sys.path:
    sys.path.append(_SIB)

from energy_density import COUPLES, molar_mass, WH_PER_MOL_V  # noqa: E402

# g/cm^3 (= kg/L). All assumed (typical handbook values, not checked in this run).
DENSITY = {
    "Pb": 11.34, "PbO2": 9.38, "H2SO4": 1.83, "H2O": 1.00,
    "LiC6": 2.20,        # graphite 2.26 expanded about 10% on lithiation; approximate
    "Li0.5CoO2": 5.00,   # LiCoO2 is 5.05; the half-delithiated phase is a little less dense
    "FePO4": 3.07, "Li": 0.534, "S": 2.07, "Zn": 7.14, "Al": 2.70,
    "O2": 1.141,         # liquid O2 at its boiling point, 90 K
    "H2": 0.0402,        # gas at 700 bar, 288 K (US DOE value used in energy-density)
}
# Liquid hydrogen at 20 K, assumed.
H2_LIQUID = 0.0708

AIR_BREATHERS = ("O2",)


def reactant_volume_l(reactants, drop=()):
    """Litres of reactants per reaction (per mole of the first listed unit), skipping `drop`."""
    v = 0.0
    for coeff, f in reactants:
        if f in drop:
            continue
        v += coeff * molar_mass(f) / DENSITY[f] / 1000.0
    return v


def volumetric_row(key, h2_density=None):
    """Wh/L with all reactants stored, and with O2 taken from air. `h2_density` overrides H2."""
    for k, label, reactants, n, volts, _metal, _src in COUPLES:
        if k == key:
            break
    else:
        raise KeyError(key)
    saved = DENSITY["H2"]
    if h2_density is not None:
        DENSITY["H2"] = h2_density
    try:
        wh = n * volts * WH_PER_MOL_V
        v_all = reactant_volume_l(reactants)
        v_air = reactant_volume_l(reactants, drop=AIR_BREATHERS)
    finally:
        DENSITY["H2"] = saved
    return {"key": k, "label": label, "wh_l_all": wh / v_all, "wh_l_air": wh / v_air}


def store_wh_per_l(wh_per_kg, density_kg_l):
    """Volumetric figure for a store whose specific figure and bulk density are known."""
    return wh_per_kg * density_kg_l
