"""How hard does the least-cost German system actually cycle its storage, and what does it pay to charge?

Solves the sourced one-node PyPSA model of `energy-mix-sourced` and reads three things off the optimal
dispatch for each store: full-cycle equivalents a year, discharge hours a year (energy delivered divided by
discharge power), and the volume-weighted electricity price paid while charging (the bus shadow price, EUR/MWh).
`energy-lcos` assumes 2,000 discharge hours a year and a $10 to 100/MWh charging price for every technology.
"""
from energy_mix_sourced.model import load_data, load_params, build, solve

# store -> (charge link, discharge link)
STORES = {"batt": ("batt_in", "batt_out"), "h2": ("elec", "fuelcell")}


def store_stats(n, name):
    """Realised use of one store in a solved network."""
    cin, cout = STORES[name]
    e_nom = float(n.stores.e_nom_opt[name])
    p_out = float(n.links.p_nom_opt[cout])
    if e_nom <= 0 or p_out <= 0:
        return None
    w = n.snapshot_weightings.generators
    price = n.buses_t.marginal_price["el"]
    charged = (n.links_t.p0[cin] * w)                       # MWh drawn from the el bus
    delivered = (-n.links_t.p1[cout] * w)                   # MWh delivered to the el bus
    drawn_from_store = (n.links_t.p0[cout] * w).sum()       # MWh leaving the store
    return {
        "e_nom_gwh": e_nom / 1e3,
        "p_out_gw": p_out / 1e3,
        "duration_h": e_nom / p_out,                         # storage MWh per MW of discharge (store-side)
        "cycles_per_year": float(drawn_from_store / e_nom),
        "discharge_hours": float(drawn_from_store / p_out),
        "charge_price": float((charged * price).sum() / charged.sum()) if charged.sum() > 0 else float("nan"),
        "delivered_gwh": float(delivered.sum() / 1e3),
    }


def system_stats(n, d):
    price = n.buses_t.marginal_price["el"]
    load = d["load_mw"]
    return {"mean_price": float((price * load).sum() / load.sum()), "zero_price_hours": int((price < 1e-6).sum()),
            "cost_per_mwh": float(n.objective / load.sum())}


def run(basis="head_2030", hours=None, **kw):
    d = load_data(hours)
    n, _ = build(d, load_params(basis), **kw)
    solve(n)
    out = {"system": system_stats(n, d)}
    for s in STORES:
        if (s == "batt" and kw.get("allow_batt", True)) or (s == "h2" and kw.get("allow_h2", True)):
            out[s] = store_stats(n, s)
    return out
