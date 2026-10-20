"""Least-cost supply mix for one year of hourly demand, in PyPSA (single node, no grid).

Technologies: solar PV, onshore wind, gas turbine (the firm supply, emissions-capped),
Li-ion battery (power and energy sized separately) and hydrogen storage (electrolyser,
tank, fuel cell sized separately).  All costs are ASSUMED round numbers (see README).
"""
from pathlib import Path

import numpy as np
import pandas as pd
import pypsa

DATA = Path(__file__).resolve().parents[2] / "data" / "de2019.csv"
RATE = 0.07  # discount rate
GAS_CO2 = 0.37  # t CO2 per MWh of electricity from gas (CCGT, ~0.20 t/MWh_th at 55%)

# name: (overnight $/kW or $/kWh, life years, fixed O&M as share of capex per year)
COST = {
    "solar": (1000.0, 25, 0.02),
    "wind": (1400.0, 25, 0.025),
    "gas": (1000.0, 30, 0.02),
    "batt_power": (150.0, 15, 0.02),
    "batt_energy": (200.0, 15, 0.0),
    "elec": (600.0, 20, 0.02),
    "h2_store": (15.0, 30, 0.01),
    "fuelcell": (900.0, 25, 0.02),
}
GAS_FUEL = 35.0  # $/MWh thermal
GAS_EFF = 0.55
ETA_BATT = 0.92  # each way
ETA_ELEC = 0.70
ETA_FC = 0.50


def annual(name, mult=1.0):
    """Annualised cost per MW (or per MWh) in $/yr from $/kW overnight."""
    capex, life, om = COST[name]
    crf = RATE / (1 - (1 + RATE) ** -life)
    return capex * 1000.0 * mult * (crf + om)


def load_data(hours=None):
    d = pd.read_csv(DATA, parse_dates=["utc"]).set_index("utc")
    d.index = d.index.tz_localize(None)
    return d if hours is None else d.iloc[:hours]


def build(d, co2_frac=1.0, batt_mult=1.0, h2store_mult=1.0, allow_h2=True, allow_batt=True,
          co2_base=None):
    """co2_frac: emissions cap as a share of the emissions of serving all load with gas."""
    n = pypsa.Network()
    n.set_snapshots(d.index)
    n.add("Bus", "el")
    n.add("Load", "load", bus="el", p_set=d["load_mw"])
    n.add("Generator", "solar", bus="el", p_nom_extendable=True, p_max_pu=d["solar_cf"],
          capital_cost=annual("solar"))
    n.add("Generator", "wind", bus="el", p_nom_extendable=True, p_max_pu=d["wind_cf"],
          capital_cost=annual("wind"))
    n.add("Generator", "gas", bus="el", p_nom_extendable=True, capital_cost=annual("gas"),
          marginal_cost=GAS_FUEL / GAS_EFF, efficiency=1.0, carrier="gas")
    n.add("Carrier", "gas", co2_emissions=GAS_CO2)
    base = d["load_mw"].sum() * GAS_CO2 if co2_base is None else co2_base
    n.add("GlobalConstraint", "co2", sense="<=", constant=co2_frac * base,
          carrier_attribute="co2_emissions")
    if allow_batt:
        n.add("Bus", "batt")
        n.add("Link", "batt_in", bus0="el", bus1="batt", efficiency=ETA_BATT,
              p_nom_extendable=True, capital_cost=annual("batt_power") / 2)
        n.add("Link", "batt_out", bus0="batt", bus1="el", efficiency=ETA_BATT,
              p_nom_extendable=True, capital_cost=annual("batt_power") / 2)
        n.add("Store", "batt", bus="batt", e_nom_extendable=True, e_cyclic=True,
              capital_cost=annual("batt_energy", batt_mult))
    if allow_h2:
        n.add("Bus", "h2")
        n.add("Link", "elec", bus0="el", bus1="h2", efficiency=ETA_ELEC,
              p_nom_extendable=True, capital_cost=annual("elec"))
        n.add("Link", "fuelcell", bus0="h2", bus1="el", efficiency=ETA_FC,
              p_nom_extendable=True, capital_cost=annual("fuelcell") * ETA_FC)
        n.add("Store", "h2", bus="h2", e_nom_extendable=True, e_cyclic=True,
              capital_cost=annual("h2_store", h2store_mult))
    return n


def solve(n):
    status, cond = n.optimize(solver_name="highs")
    if status != "ok":
        raise RuntimeError(f"solve failed: {status} {cond}")
    return n


def summary(n, d):
    """Plain dict of the results of a solved network, in GW / TWh / $ per MWh."""
    load = d["load_mw"].sum()
    g = n.generators_t.p
    out = {
        "cost_per_mwh": float(n.objective / load),
        "solar_gw": float(n.generators.p_nom_opt["solar"] / 1e3),
        "wind_gw": float(n.generators.p_nom_opt["wind"] / 1e3),
        "gas_gw": float(n.generators.p_nom_opt["gas"] / 1e3),
        "gas_share": float(g["gas"].sum() / load),
        "emissions_frac": float(g["gas"].sum() * GAS_CO2 / (load * GAS_CO2)),
    }
    avail = g["solar"].sum() + g["wind"].sum()
    pot = (n.generators.p_nom_opt["solar"] * d["solar_cf"].sum()
           + n.generators.p_nom_opt["wind"] * d["wind_cf"].sum())
    out["curtail_frac"] = float(1 - avail / pot) if pot > 0 else 0.0
    out["batt_gwh"] = float(n.stores.e_nom_opt.get("batt", 0.0) / 1e3)
    out["batt_gw"] = float(n.links.p_nom_opt.get("batt_out", 0.0) / 1e3)
    out["h2_gwh"] = float(n.stores.e_nom_opt.get("h2", 0.0) / 1e3)
    out["elec_gw"] = float(n.links.p_nom_opt.get("elec", 0.0) / 1e3)
    out["fc_gw"] = float(n.links.p_nom_opt.get("fuelcell", 0.0) / 1e3)
    return out


def run(co2_frac=1.0, hours=None, **kw):
    d = load_data(hours)
    n = solve(build(d, co2_frac=co2_frac, **kw))
    return n, d, summary(n, d)
