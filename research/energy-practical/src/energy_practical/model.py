"""Ratios of practical figures to the first-principles ceilings of research/energy-density."""
from energy_density import couple_row, flow_battery_wh_per_l, sphere_shell_mass_per_volume, P_ATM
from .data import PRACTICAL, H2_SYSTEM, LHV_H2_KWH_PER_KG

H2_DENSITY_700 = 40.2  # kg/m3, as in energy-density


def ceilings():
    """Ceiling for each key used in PRACTICAL, in the practical figure's own unit."""
    out = {k: couple_row(k)["wh_kg"] for k in ("li_ion_lco", "li_ion_lfp", "lead_acid")}
    out["vrfb_1p6"] = flow_battery_wh_per_l(1.6, 1.26)
    return out


def gaps():
    """List of (entry, ceiling, low ratio, high ratio) for entries that have a same-basis ceiling."""
    c = ceilings()
    rows = []
    for e in PRACTICAL:
        if e["ceiling"]:
            ce = c[e["ceiling"]]
            rows.append((e, ce, e["low"] / ce, e["high"] / ce))
    return rows


def h2_wt_percent():
    """(practical wt% of H2 in the whole system, ideal-sphere ceilings at safety factor 1 and 2.25)."""
    practical = H2_SYSTEM["kwh_kg"] / LHV_H2_KWH_PER_KG * 100
    ceil = []
    for sf in (1.0, 2.25):
        shell = sphere_shell_mass_per_volume(700e5 - P_ATM, 2.86e9, 1560.0, safety=sf)
        ceil.append(100 * H2_DENSITY_700 / (H2_DENSITY_700 + shell))
    return practical, ceil
