"""energy-mix with sourced costs: one-node PyPSA least-cost mix of solar, wind, gas, Li-ion and hydrogen.

Same structure as the sibling project ``energy-mix`` (Germany 2019, one node, emissions cap), but every
cost, life, fixed O&M, efficiency, fuel price and CO2 intensity is read from ``data/params.csv``, which
``data/fetch_params.py`` extracts from PyPSA technology-data at a pinned revision (Danish Energy Agency
and other primary sources are named per row).  Costs stay in EUR as published; nothing is inflated.
"""
import csv
from pathlib import Path

import pandas as pd
import pypsa

HERE = Path(__file__).resolve().parents[2]
PARAMS = HERE / "data" / "params.csv"
DATA = HERE.parent / "energy-mix" / "data" / "de2019.csv"  # OPSD / ENTSO-E 2019, from the sibling project
RATE = 0.07  # discount rate, the PyPSA-Eur default; not from the cost table


def load_params(basis):
    """{technology: {parameter: float}} for one basis (a row group of params.csv)."""
    out = {}
    with open(PARAMS) as f:
        for r in csv.DictReader(f):
            if r["basis"] == basis:
                out.setdefault(r["technology"], {})[r["parameter"]] = float(r["value"])
    if not out:
        raise KeyError(f"unknown basis {basis!r}")
    return out


def crf(life, rate=RATE):
    return rate / (1 - (1 + rate) ** -life)


def annual(p, tech, mult=1.0, rate=RATE):
    """Annualised cost per kW (or kWh) times 1000 -> EUR per MW (or MWh) per year, with fixed O&M."""
    t = p[tech]
    return t["investment"] * 1000.0 * mult * (crf(t["lifetime"], rate) + t.get("FOM", 0.0) / 100.0)


def load_data(hours=None):
    d = pd.read_csv(DATA, parse_dates=["utc"]).set_index("utc")
    d.index = d.index.tz_localize(None)
    return d if hours is None else d.iloc[:hours]


def build(d, p, co2_frac=1.0, h2="tank", h2store_mult=1.0, batt_mult=1.0, allow_batt=True,
          allow_h2=True, rate=RATE):
    """h2: 'tank' (steel tank type 1 incl. compressor) or 'cavern' (underground storage)."""
    tank = {"tank": "hydrogen storage tank type 1 including compressor",
            "cavern": "hydrogen storage underground"}[h2]
    gas, ccgt = p["gas"], p["CCGT"]
    eta_gas = ccgt["efficiency"]
    co2_per_mwh_e = gas["CO2 intensity"] / eta_gas
    n = pypsa.Network()
    n.set_snapshots(d.index)
    n.add("Bus", "el")
    n.add("Load", "load", bus="el", p_set=d["load_mw"])
    n.add("Generator", "solar", bus="el", p_nom_extendable=True, p_max_pu=d["solar_cf"],
          capital_cost=annual(p, "solar-utility", rate=rate))
    n.add("Generator", "wind", bus="el", p_nom_extendable=True, p_max_pu=d["wind_cf"],
          capital_cost=annual(p, "onwind", rate=rate), marginal_cost=p["onwind"].get("VOM", 0.0))
    n.add("Generator", "gas", bus="el", p_nom_extendable=True, capital_cost=annual(p, "CCGT", rate=rate),
          marginal_cost=gas["fuel"] / eta_gas + ccgt.get("VOM", 0.0), carrier="gas")
    n.add("Carrier", "gas", co2_emissions=co2_per_mwh_e)
    n.add("GlobalConstraint", "co2", sense="<=", constant=co2_frac * d["load_mw"].sum() * co2_per_mwh_e,
          carrier_attribute="co2_emissions")
    if allow_batt:
        inv = p["battery inverter"]
        eta = inv["efficiency"]  # charge and discharge each pass the inverter
        n.add("Bus", "batt")
        for name, b0, b1 in (("batt_in", "el", "batt"), ("batt_out", "batt", "el")):
            n.add("Link", name, bus0=b0, bus1=b1, efficiency=eta, p_nom_extendable=True,
                  capital_cost=annual(p, "battery inverter", rate=rate) / 2)
        n.add("Store", "batt", bus="batt", e_nom_extendable=True, e_cyclic=True,
              capital_cost=annual(p, "battery storage", batt_mult, rate=rate))
    if allow_h2:
        n.add("Bus", "h2")
        n.add("Link", "elec", bus0="el", bus1="h2", efficiency=p["electrolysis"]["efficiency"],
              p_nom_extendable=True, capital_cost=annual(p, "electrolysis", rate=rate))
        fc = p["fuel cell"]
        n.add("Link", "fuelcell", bus0="h2", bus1="el", efficiency=fc["efficiency"],
              p_nom_extendable=True, capital_cost=annual(p, "fuel cell", rate=rate) * fc["efficiency"])
        n.add("Store", "h2", bus="h2", e_nom_extendable=True, e_cyclic=True,
              capital_cost=annual(p, tank, h2store_mult, rate=rate))
    return n, co2_per_mwh_e


def solve(n):
    status, cond = n.optimize(solver_name="highs")
    if status != "ok":
        raise RuntimeError(f"solve failed: {status} {cond}")
    return n


def summary(n, d):
    load = d["load_mw"].sum()
    g = n.generators_t.p
    pot = (n.generators.p_nom_opt["solar"] * d["solar_cf"].sum()
           + n.generators.p_nom_opt["wind"] * d["wind_cf"].sum())
    used = g["solar"].sum() + g["wind"].sum()
    return {
        "cost_per_mwh": float(n.objective / load),
        "solar_gw": float(n.generators.p_nom_opt["solar"] / 1e3),
        "wind_gw": float(n.generators.p_nom_opt["wind"] / 1e3),
        "gas_gw": float(n.generators.p_nom_opt["gas"] / 1e3),
        "gas_share": float(g["gas"].sum() / load),
        "curtail_frac": float(1 - used / pot) if pot > 0 else 0.0,
        "batt_gwh": float(n.stores.e_nom_opt.get("batt", 0.0) / 1e3),
        "h2_gwh": float(n.stores.e_nom_opt.get("h2", 0.0) / 1e3),
        "elec_gw": float(n.links.p_nom_opt.get("elec", 0.0) / 1e3),
        "fc_gw": float(n.links.p_nom_opt.get("fuelcell", 0.0) / 1e3),
    }


def run(basis, hours=None, **kw):
    d = load_data(hours)
    n, _ = build(d, load_params(basis), **kw)
    solve(n)
    return n, d, summary(n, d)
