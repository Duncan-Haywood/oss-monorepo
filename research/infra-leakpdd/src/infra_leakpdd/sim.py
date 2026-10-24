"""Net3 (EPANET example network, bundled with WNTR) under demand-driven (DD) and pressure-driven (PDD) demand, with an optional leak."""
import os
import numpy as np
import wntr

HOURS = 72                      # hourly; a leak opens at hour 24 and is read at hour 48
LEAK_START = 24
READ = 48
G = 9.80665
CD = 0.75                       # orifice discharge coefficient (WNTR default for add_leak is 0.75)
REQ_P = 15.0                    # m, required pressure of the PDD curve: demand is full at or above it (a common planning value, swept in experiments/run.py)


def _model(mult=1.0, pdd=False, req=REQ_P, hours=HOURS):
    p = os.path.join(os.path.dirname(wntr.__file__), "library", "networks", "Net3.inp")
    wn = wntr.network.WaterNetworkModel(p)
    wn.options.time.duration = hours * 3600
    wn.options.time.hydraulic_timestep = 3600
    wn.options.time.report_timestep = 3600
    for name in wn.junction_name_list:
        for ts in wn.get_node(name).demand_timeseries_list:
            ts.base_value = ts.base_value * mult
    if pdd:
        wn.options.hydraulic.demand_model = "PDD"
        wn.options.hydraulic.required_pressure = req
        wn.options.hydraulic.minimum_pressure = 0.0
    return wn


def junctions():
    return list(_model(1.0, hours=1).junction_name_list)


def leak_area(flow, head):
    """Orifice area (m2) that passes `flow` (m3/s) at pressure head `head` (m): Q = Cd A sqrt(2 g h)."""
    return flow / (CD * np.sqrt(2 * G * max(head, 1.0)))


def run(mult=1.0, pdd=False, leak_node=None, area=None, req=REQ_P):
    """Hourly pressures (m, hours+1 x junctions), delivered junction demand (m3/s, same shape) and the leak flow (m3/s)."""
    wn = _model(mult, pdd, req)
    if leak_node is not None:
        wn.get_node(leak_node).add_leak(wn, area=area, discharge_coeff=CD, start_time=LEAK_START * 3600)
    res = wntr.sim.WNTRSimulator(wn).run_sim()
    J = wn.junction_name_list
    leak = res.node["leak_demand"][leak_node].values if leak_node is not None else np.zeros(HOURS + 1)
    return res.node["pressure"][J].values, res.node["demand"][J].values, leak
