"""Storage technologies built from sourced costs (data/techdata.csv, data/atb.csv), run through energy-lcos.

Each technology is a power block ($/kW) plus an energy block ($/kWh), as in energy-lcos. All blocks come from
PyPSA technology-data (Danish Energy Agency, Viswanathan et al. 2022 / PNNL-33283). The spread between
estimates comes from the file's own cost years (2020, 2030, 2050) and, for Li-ion and pumped hydro, from NREL
ATB 2024 scenarios and site classes. Cycle life and annual fade are NOT sourced here: they stay at the
energy-lcos values and section E of the experiment sweeps them.
"""
import csv
import random
from dataclasses import replace
from pathlib import Path

from energy_lcos import TECHS, lcos

__all__ = ["EUR_USD", "SPECS", "load", "build", "alternatives", "lcos_at", "winner_at", "win_shares"]

DATA = Path(__file__).resolve().parents[2] / "data"
EUR_USD = 1.12998          # ECB reference rate, annual average 2025 (data-api.ecb.europa.eu EXR A.USD.EUR.SP00.A)
BASE_YEAR = 2030

# name -> (power-block rows, energy-block rows, energy-block capacity unit); H2 handled in build().
SPECS = {
    "li-ion (LFP)": ("battery inverter", "battery storage"),
    "vanadium flow": ("Vanadium-Redox-Flow-bicharger", "Vanadium-Redox-Flow-store"),
    "pumped hydro": ("Pumped-Storage-Hydro-bicharger", "Pumped-Storage-Hydro-store"),
    "compressed air (cavern)": ("Compressed-Air-Adiabatic-bicharger", "Compressed-Air-Adiabatic-store"),
    "hydrogen (cavern)": ("electrolysis+fuel cell", "hydrogen storage underground"),
}


def load():
    """({(technology, parameter, year): value}, atb rows) from the committed CSVs."""
    td = {}
    with open(DATA / "techdata.csv") as f:
        for r in csv.DictReader(f):
            td[(r["technology"], r["parameter"], int(r["cost_year"]))] = float(r["value"])
    with open(DATA / "atb.csv") as f:
        atb = list(csv.DictReader(f))
    return td, atb


def _blocks(name, td, year):
    """Raw per-block numbers in USD: dict(p, e, fom_p, fom_e (fraction/yr of block cost), life_p, life_e, rte)."""
    pw, en = SPECS[name]
    g = lambda t, p: td[(t, p, year)]
    if name == "hydrogen (cavern)":
        # electrolyser and fuel cell, each sized to the discharge power; storage is per kWh of hydrogen (LHV),
        # so per kWh of electricity delivered it is divided by the fuel-cell efficiency.
        e_el, e_fc = g("electrolysis", "efficiency"), g("fuel cell", "efficiency")
        p = g("electrolysis", "investment") + g("fuel cell", "investment")
        p_fom = (g("electrolysis", "investment") * g("electrolysis", "FOM") + g("fuel cell", "investment") * g("fuel cell", "FOM")) / p
        life_p = (g("electrolysis", "investment") * g("electrolysis", "lifetime") + g("fuel cell", "investment") * g("fuel cell", "lifetime")) / p
        return dict(p=p * EUR_USD, e=g(en, "investment") / e_fc * EUR_USD, fom_p=p_fom / 100, fom_e=g(en, "FOM") / 100,
                    life_p=life_p, life_e=g(en, "lifetime"), rte=e_el * e_fc)
    eff = g(pw, "efficiency")
    if name == "li-ion (LFP)":
        # DEA gives one inverter efficiency; the storage block has no efficiency of its own. Both ways through it.
        eff = g(pw, "efficiency")
    e_cost = g(en, "investment")                                   # EUR/kWh (battery, hydrogen) or EUR/MWh (others)
    if g(en, "investment") > 1000:                                 # EUR/MWh rows
        e_cost /= 1000.0
    p_cost = g(pw, "investment")
    if p_cost > 20000:                                             # EUR/MW rows -> EUR/kW
        p_cost /= 1000.0
    fom_e = td.get((en, "FOM", year), 0.0) / 100
    return dict(p=p_cost * EUR_USD, e=e_cost * EUR_USD, fom_p=g(pw, "FOM") / 100, fom_e=fom_e,
                life_p=g(pw, "lifetime"), life_e=g(en, "lifetime"), rte=eff * eff)


def build(name, td, year=BASE_YEAR, p_scale=1.0, e_scale=1.0):
    """A function duration -> energy_lcos.Tech. FOM and life depend on the duration because the two blocks'
    shares of capital change with it: life is the capital-weighted mean of the blocks' lives, FOM the sum of
    each block's fixed-O&M fraction times its cost."""
    b = _blocks(name, td, year)
    base = TECHS[name]

    def at(duration):
        p, e = b["p"] * p_scale, b["e"] * e_scale
        cap = p + e * duration
        life = (p * b["life_p"] + e * duration * b["life_e"]) / cap
        fom = p * b["fom_p"] + e * duration * b["fom_e"]
        return replace(base, power_cost=p, energy_cost=e, rte=b["rte"], life=life, fom=fom)

    return at


def _fit_battery(atb, scenario, year):
    """Least-squares power ($/kW) and energy ($/kWh) of Li-ion from ATB overnight cost at 2, 4, 6, 8, 10 h."""
    pts = [(int(r["techdetail"].split("Hr")[0]), float(r["value"])) for r in atb
           if r["technology"].startswith("Utility") and r["scenario"] == scenario and r["year"] == str(year)
           and r["parameter"] == "OCC"]
    n = len(pts)
    sx, sy = sum(x for x, _ in pts), sum(y for _, y in pts)
    sxx, sxy = sum(x * x for x, _ in pts), sum(x * y for x, y in pts)
    e = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return (sy - e * sx) / n, e


def _psh_factors(atb):
    """ATB 2030 pumped-storage overnight cost by site class, as a ratio to the median class (Moderate)."""
    vals = sorted({(r["techdetail"], float(r["value"])) for r in atb if r["technology"].startswith("Pumped")
                   and r["scenario"] == "Moderate" and r["year"] == "2030" and r["parameter"] == "OCC"}, key=lambda t: t[1])
    vals = [v for _, v in vals]
    med = vals[len(vals) // 2]
    return vals[0] / med, vals[-1] / med


def alternatives(td, atb):
    """{name: {'p': (lo, hi), 'e': (lo, hi)}}: the lowest and highest sourced estimate of each block's cost, as
    a multiple of the base (technology-data 2030) value. Estimates: technology-data at 2020, 2030, 2050; for
    Li-ion also ATB 2024 Conservative, Moderate and Advanced (2024 and 2030 cost years) fitted as p + e*h; for
    pumped hydro the ATB site-class spread applied to both blocks."""
    out = {}
    for name in SPECS:
        b0 = _blocks(name, td, BASE_YEAR)
        ps = [_blocks(name, td, y)["p"] for y in (2020, 2030, 2050)]
        es = [_blocks(name, td, y)["e"] for y in (2020, 2030, 2050)]
        if name == "li-ion (LFP)":
            for sc in ("Conservative", "Moderate", "Advanced"):
                for yr in (2024, 2030):
                    p, e = _fit_battery(atb, sc, yr)
                    ps.append(p)
                    es.append(e)
        lo_p, hi_p = min(ps) / b0["p"], max(ps) / b0["p"]
        lo_e, hi_e = min(es) / b0["e"], max(es) / b0["e"]
        if name == "pumped hydro":
            f_lo, f_hi = _psh_factors(atb)
            lo_p, hi_p, lo_e, hi_e = lo_p * f_lo, hi_p * f_hi, lo_e * f_lo, hi_e * f_hi
        out[name] = {"p": (lo_p, hi_p), "e": (lo_e, hi_e)}
    return out


def lcos_at(name, td, duration, year=BASE_YEAR, p_scale=1.0, e_scale=1.0, **kw):
    return lcos(build(name, td, year, p_scale, e_scale)(duration), duration, **kw)


def winner_at(td, duration, year=BASE_YEAR, **kw):
    return min(SPECS, key=lambda n: lcos_at(n, td, duration, year, **kw))


RATE = (0.03, 0.10)
CHARGE = (10.0, 100.0)


def win_shares(td, alts, durations, n=2000, seed=0, rate=None, charge=None):
    """{duration: {tech: share of n scenarios in which it has the lowest LCOS}}, block costs drawn uniformly
    between the lowest and highest sourced estimate (`alts`), rate and charging price as scenario sweeps."""
    rng = random.Random(seed)
    wins = {d: {k: 0 for k in SPECS} for d in durations}
    for _ in range(n):
        fs = {k: build(k, td, BASE_YEAR, rng.uniform(*alts[k]["p"]), rng.uniform(*alts[k]["e"])) for k in SPECS}
        r = rate if rate is not None else rng.uniform(*RATE)
        c = charge if charge is not None else rng.uniform(*CHARGE)
        for d in durations:
            best = min(SPECS, key=lambda k: lcos(fs[k](d), d, rate=r, charge_price=c))
            wins[d][best] += 1
    return {d: {k: v / n for k, v in w.items()} for d, w in wins.items()}
