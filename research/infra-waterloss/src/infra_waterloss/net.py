"""Net3 (EPANET example network, bundled with WNTR) hydraulics with demand uncertainty and a leak."""
import os
import numpy as np
import wntr

HOURS = 168                     # one week, hourly pressures
G = 9.80665


def _model(hours=HOURS):
    p = os.path.join(os.path.dirname(wntr.__file__), "library", "networks", "Net3.inp")
    wn = wntr.network.WaterNetworkModel(p)
    wn.options.time.duration = hours * 3600
    wn.options.time.hydraulic_timestep = 3600
    wn.options.time.report_timestep = 3600
    return wn


def junctions():
    return list(_model(1).junction_name_list)


def _hourly(wn, pattern, hours):
    """Pattern multipliers at each hour (None = the network default pattern)."""
    pat = wn.get_pattern(pattern if pattern is not None else wn.options.hydraulic.pattern)
    return np.array([pat.at(h * 3600) for h in range(hours + 1)])


def perturb_demands(wn, rng, sigma_node, sigma_sys, rho=0.9, hours=HOURS):
    """True demand = nominal x node factor (lognormal, sd sigma_node, fixed all week) x (1 + e_t),
    e_t an AR(1) series with marginal sd sigma_sys shared by every node."""
    e = np.zeros(hours + 1)
    for t in range(1, hours + 1):
        e[t] = rho * e[t - 1] + rng.normal(0.0, sigma_sys * np.sqrt(1 - rho ** 2))
    e[0] = rng.normal(0.0, sigma_sys)
    for name in wn.junction_name_list:
        j = wn.get_node(name)
        f = np.exp(rng.normal(-0.5 * sigma_node ** 2, sigma_node)) if sigma_node > 0 else 1.0
        ts = j.demand_timeseries_list[0]
        mult = _hourly(wn, ts.pattern_name, hours) * (1.0 + e)
        pname = "p_" + name
        wn.add_pattern(pname, list(np.maximum(mult, 0.0)))
        ts.base_value = ts.base_value * f
        ts.pattern_name = pname
    wn.options.time.pattern_timestep = 3600


def simulate(seed=0, sigma_node=0.0, sigma_sys=0.0, leak_node=None, leak_flow_frac=None, leak_start=96,
             nominal_pressure=None, mean_demand=None, hours=HOURS):
    """Hourly junction pressures (m), shape (hours+1, n_junctions); the leak's flow (m3/s) and the total demand.

    The leak area is set so that the leak flow is `leak_flow_frac` of `mean_demand` (m3/s, the nominal week's mean total demand) at the nominal pressure
    `nominal_pressure` (m) of that node at the leak start (orifice law Q = Cd A sqrt(2 g h), Cd 0.75)."""
    wn = _model(hours)
    if sigma_node > 0 or sigma_sys > 0:
        perturb_demands(wn, np.random.default_rng(seed), sigma_node, sigma_sys, hours=hours)
    if leak_node is not None:
        q = leak_flow_frac * mean_demand
        area = q / (0.75 * np.sqrt(2 * G * max(nominal_pressure, 1.0)))
        wn.get_node(leak_node).add_leak(wn, area=area, discharge_coeff=0.75, start_time=leak_start * 3600)
    res = wntr.sim.WNTRSimulator(wn).run_sim()
    pr = res.node["pressure"][wn.junction_name_list].values
    leak = res.node["leak_demand"][leak_node].values if leak_node is not None else np.zeros(hours + 1)
    dem = res.node["demand"][wn.junction_name_list].values.sum(axis=1)
    return pr, leak, dem
