"""A lithium-ion cell as a function from four design numbers to a score, via PyBaMM.

Design x = (positive thickness um, positive porosity, negative porosity, negative/positive
capacity ratio relative to the PyBaMM OKane2022 cell). Everything else is the OKane2022 set
(Chen et al. 2020 NMC811/graphite-SiOx data as packaged in PyBaMM), unchanged.
"""
import numpy as np

NAMES = ("pos_thickness_um", "pos_porosity", "neg_porosity", "np_ratio_rel")
BOUNDS = np.array([[50.0, 150.0], [0.20, 0.40], [0.20, 0.40], [0.90, 1.30]])
BASELINE = np.array([75.6, 0.335, 0.25, 1.0])  # OKane2022 cell, reshaped to the 5 % inactive rule below

INACTIVE = 0.05          # binder + carbon volume fraction, held fixed (assumed)
RHO_INACTIVE = 1800.0    # kg/m3, assumed
RHO_ELECTROLYTE = 1210.0 # kg/m3, assumed (carbonate electrolyte, typical order)
CYCLES = 100
I_DISCHARGE = 5.0        # A, held fixed across designs (areal current density = 49 A/m2 of electrode)
I_CHARGE = 5.0           # A


def clip(x):
    return np.clip(np.asarray(x, float), BOUNDS[:, 0], BOUNDS[:, 1])


def _params(x):
    import pybamm
    t_um, e_p, e_n, r = clip(x)
    pv = pybamm.ParameterValues("OKane2022")
    t0p, t0n = pv["Positive electrode thickness [m]"], pv["Negative electrode thickness [m]"]
    pv["Positive electrode thickness [m]"] = t_um * 1e-6
    pv["Negative electrode thickness [m]"] = t_um * 1e-6 * (t0n / t0p) * r
    pv["Positive electrode porosity"] = e_p
    pv["Negative electrode porosity"] = e_n
    pv["Positive electrode active material volume fraction"] = 1 - e_p - INACTIVE
    pv["Negative electrode active material volume fraction"] = 1 - e_n - INACTIVE
    return pv


def stack_mass_kg(x, pv=None):
    """Mass of the electrode stack: both collectors, both composites, separator, electrolyte in pores.
    No casing, tabs or terminals (so Wh/kg here is stack level, above any finished cell)."""
    t_um, e_p, e_n, r = clip(x)
    pv = pv or _params(x)
    area = pv["Electrode height [m]"] * pv["Electrode width [m]"]
    m = 0.0
    for s, e in (("Positive", e_p), ("Negative", e_n)):
        t = pv[f"{s} electrode thickness [m]"]
        rho_am = pv[f"{s} electrode density [kg.m-3]"]
        comp = (1 - e - INACTIVE) * rho_am + INACTIVE * RHO_INACTIVE + e * RHO_ELECTROLYTE
        m += area * t * comp
        m += area * pv[f"{s} current collector thickness [m]"] * pv[f"{s} current collector density [kg.m-3]"]
    sep_t, sep_e = pv["Separator thickness [m]"], pv["Separator porosity"]
    m += area * sep_t * (pv["Separator density [kg.m-3]"] * (1 - sep_e) + RHO_ELECTROLYTE * sep_e)
    return m


def evaluate(x, cycles=CYCLES):
    """Return dict(score, wh_kg_bol, wh_kg_end, retention, mass_kg); score = Wh/kg at the last cycle
    (0 when the solver fails or the cell cannot be cycled)."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    x = clip(x)
    pv = _params(x)
    mass = stack_mass_kg(x, pv)
    model = pybamm.lithium_ion.SPMe({"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"})
    exp = pybamm.Experiment([(f"Discharge at {I_DISCHARGE} A until 2.5 V", f"Charge at {I_CHARGE} A until 4.2 V")] * cycles)
    fail = dict(score=0.0, wh_kg_bol=0.0, wh_kg_end=0.0, retention=0.0, mass_kg=mass)
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        e = []
        for c in (sol.cycles[1], sol.cycles[-1]):  # cycle 1 starts from a rested full cell, not representative
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            e.append(float(np.trapezoid(v * i, t)) / 3600.0)
    except Exception:
        return fail
    if len(sol.cycles) < cycles or e[0] <= 0:
        return fail
    return dict(score=e[1] / mass, wh_kg_bol=e[0] / mass, wh_kg_end=e[1] / mass,
                retention=e[1] / e[0], mass_kg=mass)
