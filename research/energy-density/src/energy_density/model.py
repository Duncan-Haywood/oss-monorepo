"""Theoretical ceilings on stored energy per kilogram and per litre, from first principles.

Every ceiling here is a property of the active material only: the reactants of a cell,
the heated mass of a thermal store, the rim of a flywheel, the water lifted in a reservoir.
Real devices add inactive mass (electrolyte, separators, current collectors, casings,
insulation, tanks, structure) and lose energy in conversion, so a practical figure is
always below the ceiling. The point of the ceiling is to say what no engineering can beat.

Inputs that are not physical constants carry a `source` string in the tables below, saying
whether the value was checked against a published source in this run or assumed.
"""
import math
import re

# CODATA 2018 exact or defined values.
FARADAY = 96485.33212        # C/mol (N_A * e, both exact since 2019)
AVOGADRO = 6.02214076e23     # 1/mol
E_CHARGE = 1.602176634e-19   # C
G0 = 9.80665                 # m/s^2, standard gravity (defined)
P_ATM = 101325.0             # Pa, standard atmosphere (defined)
T_AMBIENT = 293.15           # K, the dead-state temperature used for exergy (20 C, assumed)

# Wh per mol of electrons per volt: F / 3600.
WH_PER_MOL_V = FARADAY / 3600.0
# Wh/kg per (eV per atom) per (g/mol of atoms): 1 eV/atom = F J/mol.
WH_PER_KG_PER_EV_PER_GMOL = FARADAY / 3600.0 * 1000.0

# Standard atomic weights, abridged (IUPAC 2021; Prohaska et al. 2022, Pure Appl. Chem. 94, 573).
ATOMIC_WEIGHT = {
    "H": 1.008, "Li": 6.94, "C": 12.011, "O": 15.999, "Na": 22.990, "Al": 26.982,
    "Si": 28.085, "P": 30.974, "S": 32.06, "K": 39.098, "Fe": 55.845, "Co": 58.933,
    "Zn": 65.38, "N": 14.007, "Pb": 207.2,
}

_TOKEN = re.compile(r"([A-Z][a-z]?|\(|\))(\d*\.?\d*)")


def composition(formula):
    """Atom counts of a formula such as 'Li0.5CoO2' or 'Al(OH)3' (one level of parentheses)."""
    stack = [{}]
    pos = 0
    for m in _TOKEN.finditer(formula):
        if m.start() != pos:
            raise ValueError(f"cannot parse {formula!r} at {pos}")
        pos = m.end()
        sym, num = m.group(1), m.group(2)
        k = float(num) if num else 1.0
        if sym == "(":
            stack.append({})
            if num:
                raise ValueError(f"count after '(' in {formula!r}")
        elif sym == ")":
            if len(stack) == 1:
                raise ValueError(f"unbalanced ')' in {formula!r}")
            group = stack.pop()
            for el, c in group.items():
                stack[-1][el] = stack[-1].get(el, 0.0) + c * k
        else:
            if sym not in ATOMIC_WEIGHT:
                raise KeyError(f"no atomic weight for {sym}")
            stack[-1][sym] = stack[-1].get(sym, 0.0) + k
    if pos != len(formula) or len(stack) != 1:
        raise ValueError(f"cannot parse {formula!r}")
    return stack[0]


def molar_mass(formula):
    """g/mol."""
    return sum(ATOMIC_WEIGHT[el] * c for el, c in composition(formula).items())


def atoms(formula):
    return sum(composition(formula).values())


def _side(species):
    """species: list of (coefficient, formula). Returns (g, atoms)."""
    return (sum(c * molar_mass(f) for c, f in species),
            sum(c * atoms(f) for c, f in species))


# ---------------------------------------------------------------- electrochemical couples

# (key, label, reactants as (coeff, formula), electrons per reaction, cell voltage V,
#  basis for a "reactive metal only" figure or None, voltage source)
COUPLES = [
    ("lead_acid", "Lead-acid (Pb + PbO2 + 2 H2SO4)",
     [(1, "Pb"), (1, "PbO2"), (2, "H2SO4")], 2, 2.04, None,
     "2.04 V thermodynamic cell voltage; checked 2026-10-19 (PSI exercise; National Academies table)"),
    ("li_ion_lco", "Li-ion, graphite / LiCoO2 (half the Li cycled)",
     [(1, "LiC6"), (2, "Li0.5CoO2")], 1, 3.8, None,
     "3.8 V, the Li-ion cell voltage in Bruce et al. 2012, Table 1 as corrected; checked 2026-10-19"),
    ("li_ion_lfp", "Li-ion, graphite / LiFePO4",
     [(1, "LiC6"), (1, "FePO4")], 1, 3.3, None,
     "3.3 V average, assumed (not checked in this run)"),
    ("li_s", "Lithium-sulfur (2 Li + S -> Li2S)",
     [(2, "Li"), (1, "S")], 2, 2.2, None,
     "2.2 V, Bruce et al. 2012, Table 1 as corrected; checked 2026-10-19"),
    ("zn_air", "Zinc-air (Zn + 1/2 O2 -> ZnO)",
     [(1, "Zn"), (0.5, "O2")], 2, 1.65, [(1, "Zn")],
     "1.65 V, Bruce et al. 2012, Table 1 as corrected; checked 2026-10-19"),
    ("al_air", "Aluminium-air (Al + 3/4 O2 + 3/2 H2O -> Al(OH)3)",
     [(1, "Al"), (0.75, "O2"), (1.5, "H2O")], 3, 2.71, [(1, "Al")],
     "2.71 V standard textbook value, assumed (not checked in this run)"),
    ("li_o2", "Lithium-oxygen, non-aqueous (2 Li + O2 -> Li2O2)",
     [(2, "Li"), (1, "O2")], 2, 2.96, [(2, "Li")],
     "2.96 V Li/Li2O2 equilibrium potential, assumed (widely quoted; primary source not checked)"),
    ("h2_o2", "Hydrogen-oxygen fuel cell (H2 + 1/2 O2 -> H2O), Gibbs energy",
     [(1, "H2"), (0.5, "O2")], 2, 1.229, [(1, "H2")],
     "1.229 V from dG = -237.1 kJ/mol at 25 C, assumed standard value (not checked in this run)"),
]

# Published theoretical values used only as cross-checks of the arithmetic (tests and results).
PUBLISHED = {
    "lead_acid": (170, "170 Wh/kg at 2.04 V (167 at 2.0 V); PSI exercise and National Academies table, checked 2026-10-19"),
    "li_s": (2567, "2,567 Wh/kg; Zhou, Chen and Cui 2022, Nature Energy 7, 312"),
    "zn_air": (1086, "1,086 Wh/kg including O2; Li and Dai 2014, Chem. Soc. Rev. 43, 5257"),
    "al_air_metal": (8100, "8,100 Wh/kg (Al only); Liu et al. 2017, Green Energy Environ. 2, 246"),
    "li_o2": (3458, "3,457-3,458 Wh/kg on Li + O2 reactant mass (IUPUI poster; NASA TM-20205010120), checked 2026-10-19"),
}


def couple(key):
    for row in COUPLES:
        if row[0] == key:
            return row
    raise KeyError(key)


def specific_energy(reactants, n, volts):
    """Wh per kg of reactants."""
    grams, _ = _side(reactants)
    return n * volts * WH_PER_MOL_V / grams * 1000.0


def ev_per_atom(reactants, n, volts):
    """Free energy released per reactant atom, in eV: n*E / atoms."""
    _, count = _side(reactants)
    return n * volts / count


def mean_atomic_mass(reactants):
    grams, count = _side(reactants)
    return grams / count


def couple_row(key):
    k, label, reactants, n, volts, metal, src = couple(key)
    return {
        "key": k, "label": label, "volts": volts, "n": n,
        "wh_kg": specific_energy(reactants, n, volts),
        "wh_kg_metal": specific_energy(metal, n, volts) if metal else None,
        "ev_atom": ev_per_atom(reactants, n, volts),
        "mean_m": mean_atomic_mass(reactants),
        "source": src,
    }


def flow_battery_wh_per_l(conc_mol_l, volts, n=1):
    """Ceiling for a flow battery with two equal tanks at concentration c (mol/L of active ion),
    cycled over its full state of charge: Wh per litre of total electrolyte (both tanks)."""
    return conc_mol_l * n * volts * WH_PER_MOL_V / 2.0


# ---------------------------------------------------------------- thermal

def sensible_heat(c_kj_kgk, t_low_k, t_high_k):
    """Heat stored per kg between two temperatures, Wh/kg (constant specific heat)."""
    return c_kj_kgk * (t_high_k - t_low_k) * 1000.0 / 3600.0


def sensible_exergy(c_kj_kgk, t_low_k, t_high_k, t0=T_AMBIENT):
    """Work a reversible engine rejecting heat at t0 could get from cooling the store from
    t_high to t_low: c[(Th - Tl) - t0 ln(Th/Tl)], Wh/kg. This is the ceiling on electricity
    back from heat; the heat itself is the ceiling only if heat is what is wanted."""
    if t_low_k < t0:
        raise ValueError("store must stay at or above the dead-state temperature")
    j = c_kj_kgk * 1000.0 * ((t_high_k - t_low_k) - t0 * math.log(t_high_k / t_low_k))
    return j / 3600.0


def latent_cold_exergy(latent_kj_kg, t_melt_k, t0):
    """Exergy of a cold store that absorbs latent heat at t_melt below ambient t0, Wh/kg."""
    return latent_kj_kg * 1000.0 * (t0 / t_melt_k - 1.0) / 3600.0


# ---------------------------------------------------------------- mechanical

def gravity_wh_per_kg(height_m):
    return G0 * height_m / 3600.0


def flywheel_wh_per_kg(strength_pa, density_kg_m3, shape_factor):
    """Kinetic energy per kg of rotor at the burst-limit speed: K sigma / rho.
    K = 0.5 for a thin rim, 1.0 for an ideal constant-stress disc (the upper bound)."""
    return shape_factor * strength_pa / density_kg_m3 / 3600.0


def sphere_shell_mass_per_volume(gauge_pa, strength_pa, density_kg_m3, safety=1.0):
    """Mass of a thin-walled spherical vessel per unit enclosed volume, kg/m^3:
    wall t = p r / (2 sigma), so m / V = 3 p rho / (2 sigma) (times a safety factor)."""
    return 1.5 * gauge_pa * density_kg_m3 * safety / strength_pa


def isothermal_air_exergy_wh_per_l(p_pa, p0=P_ATM):
    """Ideal-gas work from a rigid tank at p expanded isothermally to p0, per litre of tank:
    p V ln(p/p0) - (p - p0) V. The heat for isothermal expansion comes from the surroundings."""
    j_per_m3 = p_pa * math.log(p_pa / p0) - (p_pa - p0)
    return j_per_m3 / 3600.0 / 1000.0


# ---------------------------------------------------------------- per-atom view

def ev_per_atom_from_wh_kg(wh_kg, mean_m_g_mol):
    return wh_kg * mean_m_g_mol / WH_PER_KG_PER_EV_PER_GMOL


def wh_kg_from_ev_per_atom(ev, mean_m_g_mol):
    return ev * WH_PER_KG_PER_EV_PER_GMOL / mean_m_g_mol
