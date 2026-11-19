"""Levelised cost of delivered heat for a resistance-charged sand or water store, a heat pump and a resistive heater.

The store's size and charge energy come from `energy_thermal` (the transient model of `energy-thermal`,
imported unchanged). Every capital cost, fixed O&M, lifetime and efficiency is read from data/params.csv
(PyPSA technology-data rows at a pinned revision). Money is in euros of the table's currency year
(2025 for the head_2030 basis). Stdlib only.
"""
import csv
from pathlib import Path

from energy_thermal import SAND, WATER, INSULATION, Medium, Store, size_for_delivery

SAND_HOT, SAND_CUT = 500.0, 100.0
WATER_HOT, WATER_CUT = 90.0, 40.0
T_AMB = 10.0
WOOL_COOL = Medium("mineral wool, cool side", 100.0, 840.0, 0.045)
DATA = Path(__file__).resolve().parents[2] / "data" / "params.csv"

# technology-data row names per scale
HEAT = {
    "house": {"hp": "decentral air-sourced heat pump", "res": "decentral resistive heater",
              "tank": "decentral water tank storage"},
    "district": {"hp": "central air-sourced heat pump", "res": "central resistive heater",
                 "tank": "central water tank storage"},
}


def load(basis="head_2030"):
    """{technology: {parameter: value}} for one basis of data/params.csv."""
    out = {}
    with open(DATA) as f:
        for r in csv.DictReader(f):
            if r["basis"] == basis:
                out.setdefault(r["technology"], {})[r["parameter"]] = float(r["value"])
    return out


def units(basis="head_2030"):
    """{technology: unit of its investment row} for one basis."""
    with open(DATA) as f:
        return {r["technology"]: r["unit"] for r in csv.DictReader(f)
                if r["basis"] == basis and r["parameter"] == "investment"}


def annuity(rate, years):
    """Annual payment per unit of capital: r / (1 - (1+r)^-n); 1/n at zero rate."""
    return 1.0 / years if rate == 0 else rate / (1 - (1 + rate) ** -years)


def _annual(capex, tech, rate):
    """Annualised capital plus fixed O&M (percent of capex per year) for `capex` euros of `tech`."""
    return capex * (annuity(rate, tech["lifetime"]) + tech["FOM"] / 100.0)


def hp_lcoh(td, scale, annual_kwh, price, rate=0.04, flh=2000.0, cop=None):
    """Heat pump: sized to peak = annual heat / full-load hours. Returns (capital part, energy part), EUR/kWh."""
    t = td[HEAT[scale]["hp"]]
    kw = annual_kwh / flh
    cap = _annual(kw * t["investment"], t, rate) / annual_kwh
    return cap, price / (cop or t["efficiency"])


def resistive_lcoh(td, scale, annual_kwh, price, rate=0.04, flh=2000.0):
    t = td[HEAT[scale]["res"]]
    kw = annual_kwh / flh
    return _annual(kw * t["investment"], t, rate) / annual_kwh, price / t["efficiency"]


def _advance(s, days, dt_h=6.0):
    """Run the store `days` in equal steps of at most dt_h hours (so a short idle gap is not rounded away)."""
    if days <= 0:
        return
    n = max(1, int(-(-days * 24 // dt_h)))
    dt = days * 86400.0 / n
    for _ in range(n):
        s.step(dt)


def cycle_steady(medium, volume, standby_days, period_days, t_hot, t_cut, ins_t, insulation, t_amb=T_AMB,
                 tol=1e-6, max_cycles=400):
    """Repeat charge -> stand -> discharge -> idle until the cycle repeats itself (cyclic steady state).

    Each cycle: the medium is charged instantly to a uniform t_hot (the electricity put in is the heat to lift
    every shell from where the last cycle left it, not from ambient), stands `standby_days`, gives up its heat
    down to a mean of t_cut (the same ideal exchanger `Store.usable_kwh` assumes, leaving the medium uniform at
    t_cut), then idles until the next charge, `period_days` after the last. The insulation keeps the heat it
    soaked up. Returns (heat in per cycle kWh, heat delivered per cycle kWh, cycles run). The first cycle is
    `energy_thermal`'s cold start; later ones bill only what the store lost.
    """
    s = Store(medium, volume, ins_t, insulation=insulation, t_amb=t_amb)
    nm, cap = s.n_med, s.cap
    c_med = sum(cap[:nm])
    prev = None
    for k in range(1, max_cycles + 1):
        heat_in = sum(cap[i] * (t_hot - s.T[i]) for i in range(nm)) / 3.6e6
        s.charge(t_hot)
        _advance(s, standby_days)
        out = max(0.0, c_med * (s.mean_medium_temp() - t_cut) / 3.6e6)
        if out > 0:
            for i in range(nm):
                s.T[i] = t_cut
        _advance(s, period_days - standby_days)
        if prev is not None and abs(heat_in - prev[0]) <= tol * heat_in and abs(out - prev[1]) <= tol * max(out, 1e-12):
            return heat_in, out, k
        prev = (heat_in, out)
    return heat_in, out, max_cycles


def size_steady(medium, kwh, standby_days, period_days, t_hot, t_cut, ins_t, insulation, t_amb=T_AMB):
    """Smallest volume whose store delivers `kwh` per cycle at cyclic steady state, and its (heat in, out, cycles).

    Warm insulation loses less than cold, so this volume is at most the cold-start one from
    `size_for_delivery`, which brackets the bisection from above."""
    v_cold, _ = size_for_delivery(medium, kwh, standby_days, t_hot, t_cut, ins_t, insulation=insulation, t_amb=t_amb)
    if v_cold is None:
        return None, None
    lo, hi = 0.0, v_cold
    while hi - lo > 1e-7 * v_cold:
        mid = (lo + hi) / 2
        if cycle_steady(medium, mid, standby_days, period_days, t_hot, t_cut, ins_t, insulation, t_amb)[1] < kwh:
            lo = mid
        else:
            hi = mid
    return hi, cycle_steady(medium, hi, standby_days, period_days, t_hot, t_cut, ins_t, insulation, t_amb)


def store_lcoh(td, kind, scale, annual_kwh, cycles, standby_days, price, rate=0.04, ins_t=0.5,
               cost_scale=1.0, charge_frac=0.25, accounting="steady"):
    """Resistance-charged store: charged once per cycle, held `standby_days`, then delivers annual_kwh/cycles.

    The store is sized with `size_for_delivery` so that it still holds that much heat after standing.
    Capital: the store's usable capacity (kWh between the hot and cut-off temperatures) at the table's
    per-kWh cost times `cost_scale`, plus a charger sized to charge in `charge_frac` of the cycle period.
    Returns a dict (EUR/kWh parts and physical results). The heat exchanger and any discharge-side
    equipment are not costed (no sourced figure for a sand-to-water exchanger): this favours the store.

    `accounting="steady"` (default since 2026-11-18) sizes and bills the store at cyclic steady state
    (`cycle_steady`): a cycling store is recharged from its cut-off temperature with warm insulation.
    `accounting="first-charge"` is the earlier rule, kept so the projects that pinned it still reproduce:
    every cycle billed as a first charge from ambient, the store sized with cold insulation. It overstates a
    cycling store's electricity (quality audit 2026-11-17, portfolio/quality/audits/2026-11-17-energy-thermal-cost.json).
    """
    if accounting not in ("steady", "first-charge"):
        raise ValueError("accounting must be 'steady' or 'first-charge', not %r" % (accounting,))
    if kind not in ("sand", "water"):
        raise ValueError("kind must be 'sand' or 'water', not %r" % (kind,))
    per_cycle = annual_kwh / cycles
    if kind == "sand":
        med, hot, cut, ins, st = SAND, SAND_HOT, SAND_CUT, INSULATION, td["Sand-store"]
        chg = td["Sand-charger"]
        store_eur_per_kwh = st["investment"] / 1000.0
        chg_eur_per_kw = chg["investment"] / 1000.0
    else:
        med, hot, cut, ins = WATER, WATER_HOT, WATER_CUT, WOOL_COOL
        st = td[HEAT[scale]["tank"]]
        chg = td[HEAT[scale]["res"]]
        store_eur_per_kwh = st["investment"]
        chg_eur_per_kw = chg["investment"]
    chg_eff = chg["efficiency"]
    period_h = 365.0 * 24 / cycles
    n_conv = None
    if accounting == "steady":
        v, res = size_steady(med, per_cycle, standby_days, period_h / 24, hot, cut, ins_t, ins)
        if v is None:
            return None
        heat_in_kwh, _, n_conv = res
    else:
        v, _ = size_for_delivery(med, per_cycle, standby_days, hot, cut, ins_t, insulation=ins, t_amb=T_AMB)
        if v is None:
            return None
        heat_in_kwh = v * med.rho * med.c * (hot - T_AMB) / 3.6e6
    usable_full_kwh = v * med.rho * med.c * (hot - cut) / 3.6e6
    charger_kw = heat_in_kwh / (charge_frac * period_h)
    store_cap = _annual(usable_full_kwh * store_eur_per_kwh * cost_scale, st, rate)
    chg_cap = _annual(charger_kw * chg_eur_per_kw, chg, rate)
    elec = cycles * heat_in_kwh / chg_eff * price
    q = annual_kwh
    return {"volume_m3": v, "usable_full_kwh": usable_full_kwh, "heat_in_kwh": heat_in_kwh,
            "charger_kw": charger_kw, "delivered_per_in": per_cycle / heat_in_kwh,
            "accounting": accounting, "cycles_to_steady": n_conv,
            "store_cap": store_cap / q, "charger_cap": chg_cap / q, "energy": elec / q,
            "total": (store_cap + chg_cap + elec) / q}


def breakeven_hp_price(store_total, hp_cap, cop):
    """Electricity price (EUR/kWh) at which the heat pump's levelised cost equals `store_total`."""
    return cop * (store_total - hp_cap)
