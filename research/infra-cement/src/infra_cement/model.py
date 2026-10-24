"""Mass, energy and CO2 balance of a tonne of blended cement, and the strength a substitution can keep.

All CO2 is kg per tonne of cement unless stated. Stoichiometric terms are computed from molar masses;
everything else is a named parameter in PARAMS with its source or its "assumed" flag."""
from dataclasses import dataclass, field

M_CO2, M_CAO, M_H2O = 44.009, 56.077, 18.015
M_KAOLINITE = 2 * 26.982 + 2 * 28.086 + 9 * 15.999 + 4 * 1.008   # Al2Si2O5(OH)4

# (value, source). "assumed" values are swept in the experiments.
PARAMS = {
    "cao_in_clinker": (0.65, "USGS comment on the US GHG inventory: clinker is ~65% CaO, all from CaCO3"),
    "kiln_heat_GJ_per_t_clinker": (3.4, "dry-process kiln, 3.4 GJ/t (secondary report found by search; range 3.2 to 3.6)"),
    "fuel_kgCO2_per_GJ": (94.6, "IPCC 2006 default for other bituminous coal"),
    "grinding_kWh_per_t_cement": (100.0, "assumed, swept 70 to 130"),
    "grid_kgCO2_per_kWh": (0.4, "assumed, swept 0 to 0.8"),
    "clay_calcination_GJ_per_t": (2.0, "assumed, swept 1 to 3 (theoretical dehydroxylation is below this)"),
    "clay_calcination_kgCO2_per_GJ": (56.1, "IPCC 2006 default for natural gas"),
    "slag_kgCO2_per_t": (52.0, "one secondary table of embodied CO2 of GGBS; allocation of the blast furnace's CO2 to slag is 0 in this figure; swept 0 to 150"),
    "limestone_kgCO2_per_t": (5.0, "assumed (quarrying and crushing), swept 0 to 20"),
    "gypsum_kgCO2_per_t": (5.0, "assumed"),
}


def p(name, over=None):
    return (over or {}).get(name, PARAMS[name][0])


def calcination_kgCO2_per_t_clinker(cao=None):
    """CaCO3 -> CaO + CO2: 44.009/56.077 t CO2 per t CaO."""
    cao = PARAMS["cao_in_clinker"][0] if cao is None else cao
    return 1000 * cao * M_CO2 / M_CAO


def dehydroxylation_mass_loss():
    """Kaolinite -> metakaolin + 2 H2O: mass fraction lost (water, not CO2)."""
    return 2 * M_H2O / M_KAOLINITE


@dataclass(frozen=True)
class Blend:
    name: str
    clinker: float
    clay: float = 0.0
    limestone: float = 0.0
    slag: float = 0.0
    gypsum: float = 0.05

    def total(self):
        return self.clinker + self.clay + self.limestone + self.slag + self.gypsum


BLENDS = [
    Blend("OPC (CEM I)", 0.95),
    Blend("PLC 80/15", 0.80, limestone=0.15),
    Blend("slag 50", 0.45, slag=0.50),
    Blend("slag 70", 0.25, slag=0.70),
    Blend("LC3-65", 0.65, clay=0.20, limestone=0.10),
    Blend("LC3-50", 0.50, clay=0.30, limestone=0.15),
    Blend("LC3-40", 0.40, clay=0.35, limestone=0.20),
]


def balance(b, over=None):
    """Returns a dict of kg CO2 by source, thermal GJ and electricity kWh per tonne of cement."""
    assert abs(b.total() - 1) < 1e-9, b
    cal = b.clinker * calcination_kgCO2_per_t_clinker(p("cao_in_clinker", over))
    kiln_gj = b.clinker * p("kiln_heat_GJ_per_t_clinker", over)
    fuel = kiln_gj * p("fuel_kgCO2_per_GJ", over)
    clay_gj = b.clay * p("clay_calcination_GJ_per_t", over)
    clay_co2 = clay_gj * p("clay_calcination_kgCO2_per_GJ", over)
    kwh = p("grinding_kWh_per_t_cement", over)
    elec = kwh * p("grid_kgCO2_per_kWh", over)
    other = (b.slag * p("slag_kgCO2_per_t", over) + b.limestone * p("limestone_kgCO2_per_t", over)
             + b.gypsum * p("gypsum_kgCO2_per_t", over))
    total = cal + fuel + clay_co2 + elec + other
    return {"calcination": cal, "kiln_fuel": fuel, "clay_fuel": clay_co2, "electricity": elec,
            "other": other, "total": total, "thermal_GJ": kiln_gj + clay_gj, "kWh": kwh}


# 28-day mortar strength of LC3 relative to a CEM I control, by clinker content, from a published study
# found through a search summary (2:1 calcined clay to limestone; the primary paper was not read):
# losses of 1.2, 4, 9.8 and 18 % at 20, 30, 40 and 50 % substitution; 1.6, 2.3, 3.6, 5.5 % at 91 days.
LC3_REL_28D = {0.80: 0.988, 0.70: 0.960, 0.60: 0.902, 0.50: 0.820}
LC3_REL_91D = {0.80: 0.984, 0.70: 0.977, 0.60: 0.964, 0.50: 0.945}
# Another study reports LC3-50 equal to its CEM I control (37 MPa) at 28 days: relative 1.0 at 0.50.
# EN 15167-1 requires slag at 50:50 to reach 70% of the control at 28 days (recalled, not read this run).
SLAG_SAI_28D_MIN = 0.70
CLASS_MPA = {"32.5": 32.5, "42.5": 42.5, "52.5": 52.5}   # EN 197-1 minimum 28-day standard-mortar strength


def lc3_relative_strength(clinker, table=None):
    """Piecewise-linear interpolation of the table above; clinker content in [0.5, 0.8]."""
    t = sorted((table or LC3_REL_28D).items())
    xs, ys = [k for k, _ in t], [v for _, v in t]
    if clinker <= xs[0]:
        return ys[0]
    if clinker >= xs[-1]:
        return ys[-1] + (1 - ys[-1]) * (clinker - xs[-1]) / (0.95 - xs[-1])
    for (x0, y0), (x1, y1) in zip(t, t[1:]):
        if x0 <= clinker <= x1:
            return y0 + (y1 - y0) * (clinker - x0) / (x1 - x0)


def min_clinker_for_class(opc_mpa, cls, table=None):
    """Lowest clinker content at which an LC3 cement keeps strength class `cls`, given the
    28-day strength of the OPC reference; None if no content in [0.5, 0.95] does."""
    need = CLASS_MPA[cls] / opc_mpa
    c = 0.95
    best = None
    while c >= 0.5 - 1e-9:
        if lc3_relative_strength(c, table) >= need:
            best = c
        else:
            break
        c = round(c - 0.005, 6)
    return best
