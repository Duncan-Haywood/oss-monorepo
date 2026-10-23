"""Net3 (EPANET example network, bundled with WNTR) with pump 10 run in one daily window; energy, tanks and pressure.

Net3 as shipped runs pump 10 (the lake source) from 01:00 to 15:00 each day by time controls and lets pump 335 (the
river source) follow tank 1's level. This module replaces pump 10's controls with a window (start hour, hours on),
simulates three days, and scores the last day. Energy is WNTR's pump_energy at the network's own 75 % efficiency.
"""
import os
import warnings

import numpy as np
import wntr

warnings.filterwarnings("ignore")
NET3 = os.path.join(os.path.dirname(wntr.__file__), "library", "networks", "Net3.inp")
DAYS = 3
MIN_PRESSURE_M = 14.06  # 20 psi, a common minimum service pressure; 10 states use it (assumption, swept in run.py)
J_PER_KWH = 3.6e6
PUMPS = ("10", "335")


def build(start, hours, days=DAYS, step=3600):
    """Net3 with pump 10 open for `hours` from hour `start` each day (start may be 0..23; the window may cross midnight)."""
    wn = wntr.network.WaterNetworkModel(NET3)
    wn.options.time.duration = days * 24 * 3600
    wn.options.time.hydraulic_timestep = step
    wn.options.time.report_timestep = step
    for name in [n for n, c in wn.controls() if "PUMP 10 " in str(c)]:
        wn.remove_control(name)
    pump = wn.get_link("10")
    pump.initial_status = "Closed"
    if hours >= 24:
        pump.initial_status = "Open"
        return wn
    if hours <= 0:
        return wn
    for d in range(days + 1):
        t_on = (d * 24 + start) * 3600
        t_off = t_on + hours * 3600
        if t_on <= days * 24 * 3600:
            wn.add_control(f"on{d}", wntr.network.controls.Control(
                wntr.network.controls.SimTimeCondition(wn, "=", t_on), wntr.network.controls.ControlAction(pump, "status", 1)))
        if t_off <= days * 24 * 3600 + 3600:
            wn.add_control(f"off{d}", wntr.network.controls.Control(
                wntr.network.controls.SimTimeCondition(wn, "=", t_off), wntr.network.controls.ControlAction(pump, "status", 0)))
    # a window that wrapped past midnight on the previous day is already open at t=0; one starting at 0 opens at t=0
    if start + hours > 24 or start == 0:
        pump.initial_status = "Open"
    return wn


def build_hourly(bits, days=DAYS, step=3600):
    """Net3 with pump 10 on in hour h of every day when bits[h] is 1 (24 bits): an hourly on/off schedule, not one window."""
    wn = build(0, 0, days, step)
    pump = wn.get_link("10")
    bits = [int(b) for b in bits]
    pump.initial_status = "Open" if bits[0] else "Closed"
    for d in range(days):
        for h in range(24):
            if d == 0 and h == 0:
                continue
            if bits[h] != bits[(h - 1) % 24]:
                t = (d * 24 + h) * 3600
                wn.add_control(f"sw{d}_{h}", wntr.network.controls.Control(
                    wntr.network.controls.SimTimeCondition(wn, "=", t),
                    wntr.network.controls.ControlAction(pump, "status", bits[h])))
    return wn


def simulate(start, hours, step=3600, wn=None):
    """Hourly results of the last day: dict of energy kWh per hour for each pump, tank levels, min pressure, tank drift.

    `step` is the hydraulic and report time step in seconds (it must divide 3600): Net3's booster pump 335 and pipe 330
    switch on tank levels inside the hour, so a 3600 s step samples them once an hour (see README, "Mass balance")."""
    k = 3600 // step
    wn = wn if wn is not None else build(start, hours, step=step)
    r = wntr.sim.EpanetSimulator(wn).run_sim()
    flow, head = r.link["flowrate"], r.node["head"]
    # pump_energy is the power at each report row times the report step (a left rectangle); the k rows of an hour are summed
    e = wntr.metrics.economic.pump_energy(flow[list(PUMPS)], head, wn).astype(float) / J_PER_KWH
    day = slice(48 * k, 72 * k)
    junc = [n for n in wn.junction_name_list if wn.get_node(n).demand_timeseries_list[0].base_value > 0]
    pres = r.node["pressure"][junc]
    lvl = r.node["pressure"][["1", "2", "3"]]
    area = {t: np.pi * wn.get_node(t).diameter ** 2 / 4 for t in ("1", "2", "3")}
    drift = sum((lvl[t].iloc[72 * k] - lvl[t].iloc[48 * k]) * area[t] for t in area)  # m3
    return {
        "kwh": {p: e[p].iloc[day].to_numpy().reshape(24, k).sum(axis=1) for p in PUMPS},
        "min_pressure": float(pres.iloc[24 * k:72 * k + 1].min().min()),
        "tank_min_margin": float(min((lvl[t].iloc[24 * k:72 * k + 1].min() - wn.get_node(t).min_level) for t in area)),
        "drift_m3": float(drift),
        "pump10_m3": float(flow["10"].iloc[day].sum() * step),
        "demand_m3": float(r.node["demand"][junc].iloc[day].sum().sum() * step),
        "supply_m3": float(-r.node["demand"][["River", "Lake"]].iloc[day].sum().sum() * step),
    }


def tariff(kind, ratio):
    """Hourly price (relative, off-peak = 1) for hours 0..23. Shapes are assumptions; the peak/off-peak ratio is swept."""
    p = np.ones(24)
    if kind == "evening":      # peak 16:00-21:00, as a typical residential/commercial time-of-use
        p[16:21] = ratio
    elif kind == "daytime":    # peak 08:00-20:00
        p[8:20] = ratio
    elif kind == "midday-cheap":  # solar-heavy grid: cheap 10:00-16:00, dear 17:00-21:00, shoulder otherwise
        p[:] = np.sqrt(ratio)
        p[10:16] = 1.0
        p[17:21] = ratio
    elif kind == "flat":
        pass
    else:
        raise ValueError(kind)
    return p


def cost(res, price):
    """Energy cost of the last day in price units (kWh x relative price), both pumps."""
    return float(sum((res["kwh"][p] * price).sum() for p in PUMPS))


def total_kwh(res):
    return float(sum(res["kwh"][p].sum() for p in PUMPS))
