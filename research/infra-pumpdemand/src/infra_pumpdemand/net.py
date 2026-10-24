"""Net3 with pump 10 on a repeating 24-hour on/off mask, simulated at a 15-minute step; returns 15-minute pump power.

Same network and controls as `research/infra-pumpsched` (pump 10, the lake source, switched by an hourly mask; pump 335 and
pipe 330 follow tank 1's level), but the hydraulic step is 900 s so that (a) the booster pump's switching inside the hour is
resolved (`infra-pumpsched`, "Time step") and (b) pump power is read per 15 minutes, the interval a demand charge is billed on.
"""
import os
import tempfile
import warnings

import numpy as np
import wntr

warnings.filterwarnings("ignore")
NET3 = os.path.join(os.path.dirname(wntr.__file__), "library", "networks", "Net3.inp")
DAYS = 3
STEP = 900
SLOTS = 3600 // STEP * 24  # 96 quarter-hours in the scored day
PUMPS = ("10", "335")
J_PER_KWH = 3.6e6
MIN_PRESSURE_M = 14.06  # 20 psi
TANK_MARGIN_M = 0.5


def build(mask):
    wn = wntr.network.WaterNetworkModel(NET3)
    wn.options.time.duration = DAYS * 24 * 3600
    wn.options.time.hydraulic_timestep = STEP
    wn.options.time.report_timestep = STEP
    for name in [n for n, c in wn.controls() if "PUMP 10 " in str(c)]:
        wn.remove_control(name)
    pump = wn.get_link("10")
    pump.initial_status = "Open" if mask[0] else "Closed"
    prev = bool(mask[0])
    for t in range(1, DAYS * 24 + 1):
        cur = bool(mask[t % 24])
        if cur != prev:
            wn.add_control(f"c{t}", wntr.network.controls.Control(
                wntr.network.controls.SimTimeCondition(wn, "=", t * 3600), wntr.network.controls.ControlAction(pump, "status", int(cur))))
        prev = cur
    return wn


def window(start, hours):
    """Mask with pump 10 on for `hours` from hour `start` (may cross midnight); 24 hours is on all day."""
    return tuple(True if hours >= 24 else ((h - start) % 24) < hours for h in range(24))


def simulate(mask):
    """Scored (last) day: kW per quarter-hour for each pump (arrays of 96), tank drift and margin, minimum pressure, demand."""
    wn = build(mask)
    r = wntr.sim.EpanetSimulator(wn).run_sim(file_prefix=os.path.join(tempfile.gettempdir(), f"pumpdemand_{os.getpid()}"))
    flow, head = r.link["flowrate"], r.node["head"]
    # pump_energy is power x report step in J; dividing by the step gives mean W over the quarter-hour
    p_w = wntr.metrics.economic.pump_energy(flow[list(PUMPS)], head, wn).astype(float) / STEP
    day = slice(48 * (3600 // STEP), 72 * (3600 // STEP))
    junc = [n for n in wn.junction_name_list if wn.get_node(n).demand_timeseries_list[0].base_value > 0]
    k = 3600 // STEP
    lvl = r.node["pressure"][["1", "2", "3"]]
    area = {t: np.pi * wn.get_node(t).diameter ** 2 / 4 for t in ("1", "2", "3")}
    drift = sum((lvl[t].iloc[72 * k] - lvl[t].iloc[48 * k]) * area[t] for t in area)
    return {
        "kw": {p: p_w[p].iloc[day].to_numpy() / 1000.0 for p in PUMPS},
        "min_pressure": float(r.node["pressure"][junc].iloc[24 * k:72 * k + 1].min().min()),
        "tank_margin": float(min(lvl[t].iloc[24 * k:72 * k + 1].min() - wn.get_node(t).min_level for t in area)),
        "drift_m3": float(drift),
        "demand_m3": float(r.node["demand"][junc].iloc[day].sum().sum() * STEP),
    }


def total_kw(res):
    """Total pump power per quarter-hour (96 values)."""
    return res["kw"]["10"] + res["kw"]["335"]


def feasible(res, drift_tol):
    """Tanks above their minimum by 0.5 m, pressure >= 20 psi, and |tank drift over the scored day| <= drift_tol of that day's demand."""
    return (res["min_pressure"] >= MIN_PRESSURE_M and res["tank_margin"] >= TANK_MARGIN_M
            and abs(res["drift_m3"]) <= drift_tol * res["demand_m3"])
