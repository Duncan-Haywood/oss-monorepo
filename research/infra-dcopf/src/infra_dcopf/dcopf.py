"""DC against AC optimal power flow on the IEEE/MATPOWER cases in pandapower.

Both OPFs minimise the cases' own quadratic generator cost (pandapower's
`poly_cost`). The DC dispatch is then pushed through an AC power flow (the
external grid is the slack and absorbs the losses the DC model leaves out) and
checked against the same voltage and loading limits the AC OPF respects.
"""
import copy
import warnings

import numpy as np
import pandapower as pp
import pandapower.networks as nw

warnings.filterwarnings("ignore")

CASES = {"case30": nw.case30, "case39": nw.case39, "case118": nw.case118}


def load_case(name):
    return CASES[name]()


def scaled(net, k):
    n = copy.deepcopy(net)
    n.load[["p_mw", "q_mvar"]] *= k
    return n


def gen_cost(net, p_gen, p_slack):
    """Cost in the case's currency of a dispatch: gens (in net.gen order) and the
    external grid, from the quadratic poly_cost rows."""
    total = 0.0
    for _, r in net.poly_cost.iterrows():
        p = p_slack if r.et == "ext_grid" else p_gen[int(r.element)]
        total += r.cp0_eur + r.cp1_eur_per_mw * p + r.cp2_eur_per_mw2 * p * p
    return total


def solve_ac(net):
    n = copy.deepcopy(net)
    try:
        pp.runopp(n, verbose=False)
    except Exception:
        return None
    return n


def solve_dc(net):
    n = copy.deepcopy(net)
    try:
        pp.rundcopp(n, verbose=False)
    except Exception:
        return None
    return n


def ac_check_of_dispatch(net, dc_solved):
    """Fix gens at the DC dispatch, run an AC power flow and return its violations."""
    n = copy.deepcopy(net)
    n.gen["p_mw"] = dc_solved.res_gen.p_mw.values
    try:
        pp.runpp(n, init="flat", numba=False)
    except Exception:
        return {"converged": False}
    vm = n.res_bus.vm_pu
    over = int(((vm > n.bus.max_vm_pu) | (vm < n.bus.min_vm_pu)).sum())
    lim = n.line.get("max_loading_percent", 100.0)
    line_over = int((n.res_line.loading_percent > lim).sum())
    trafo_over = int((n.res_trafo.loading_percent > n.trafo.get("max_loading_percent", 100.0)).sum()) if len(n.trafo) else 0
    p_slack = float(n.res_ext_grid.p_mw.sum())
    return {
        "converged": True,
        "n_bus_v_viol": over,
        "n_line_over": line_over,
        "n_trafo_over": trafo_over,
        "max_line_loading": float(n.res_line.loading_percent.max()),
        "vmin": float(vm.min()),
        "vmax": float(vm.max()),
        "p_slack": p_slack,
        "losses_mw": float(n.res_line.pl_mw.sum() + (n.res_trafo.pl_mw.sum() if len(n.trafo) else 0)),
        "cost": gen_cost(n, n.gen.p_mw.values, p_slack),
    }


def tighten(net, f):
    """Scale every branch thermal limit by f (f < 1 makes the network more congested)."""
    n = copy.deepcopy(net)
    n.line["max_i_ka"] *= f
    if len(n.trafo):
        n.trafo["sn_mva"] *= f
    return n


def compare(net, k, f=1.0):
    """One load level k and branch-limit factor f: costs of AC OPF, DC OPF and
    the DC dispatch evaluated under AC."""
    n = tighten(scaled(net, k), f)
    ac, dc = solve_ac(n), solve_dc(n)
    out = {"k": k, "f": f, "load_mw": float(n.load.p_mw.sum()),
           "ac_cost": ac.res_cost if ac is not None else None,
           "dc_cost": dc.res_cost if dc is not None else None}
    if ac is not None:
        out["ac_losses_mw"] = float(ac.res_line.pl_mw.sum() + (ac.res_trafo.pl_mw.sum() if len(ac.trafo) else 0))
    if dc is not None:
        out["dc_in_ac"] = ac_check_of_dispatch(n, dc)
    return out
