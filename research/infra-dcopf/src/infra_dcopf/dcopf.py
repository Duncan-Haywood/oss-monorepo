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


def loss_adjusted_dc(net, iters=6, tol_mw=0.05):
    """DC OPF with the losses fed back: after each DC solve the dispatch is run
    through an AC power flow, the measured losses are spread over the loads in
    proportion to their active power (a uniform load-scaling factor), and the DC
    OPF is solved again. Returns (last DC solution, history of losses in MW)."""
    base = net.load.p_mw.copy()
    total = float(base.sum())
    loss, hist, sol = 0.0, [], None
    for _ in range(iters):
        n = copy.deepcopy(net)
        n.load["p_mw"] = base * (1.0 + loss / total)
        sol = solve_dc(n)
        if sol is None:
            return None, hist
        chk = ac_check_of_dispatch(net, sol)
        if not chk.get("converged"):
            return sol, hist
        new = chk["losses_mw"]
        hist.append(new)
        if abs(new - loss) < tol_mw:
            break
        loss = new
    return sol, hist



def _losses(n):
    return float(n.res_line.pl_mw.sum() + (n.res_trafo.pl_mw.sum() if len(n.trafo) else 0))


def loss_sensitivities(net, dc_solved, dp=1.0):
    """dLoss/dP_g for every generator at the DC dispatch, by finite difference of an
    AC power flow: generator g is raised by dp MW and the external grid (the slack)
    absorbs the change, so the value is the loss change per MW moved from the slack
    to g. Returns an array in net.gen order, or None if the base flow diverges."""
    base = copy.deepcopy(net)
    base.gen["p_mw"] = dc_solved.res_gen.p_mw.values
    try:
        pp.runpp(base, init="flat", numba=False)
    except Exception:
        return None
    l0 = _losses(base)
    out = np.zeros(len(base.gen))
    for i in range(len(base.gen)):
        n = copy.deepcopy(base)
        n.gen.loc[n.gen.index[i], "p_mw"] += dp
        try:
            pp.runpp(n, init="warm", numba=False)
        except Exception:
            return None
        out[i] = (_losses(n) - l0) / dp
    return out


def penalty_factors(sens):
    """Penalty factor pf_g = 1 / (1 - dLoss/dP_g): one MW at g delivers 1 - dLoss/dP_g
    MW net of the extra losses (relative to the slack), so g's effective cost is
    pf_g times its own marginal cost. Clipped to [0.5, 2] against noisy sensitivities."""
    return np.clip(1.0 / (1.0 - sens), 0.5, 2.0)


def penalty_adjusted_dc(net, iters=12, tol_mw=0.05, damp=0.5):
    """Loss-adjusted DC OPF with nodal loss penalty factors: as `loss_adjusted_dc`
    (uniform load share for the loss level), and in addition each generator's cost
    curve is scaled by its penalty factor, from the AC loss sensitivities of the
    previous pass, so the merit order sees where the losses occur. The slack keeps
    factor 1 (it is the sensitivity reference). The factor update is damped
    (`damp`: weight on the new factors) because the undamped fixed point oscillates on
    case118 at full load. Returns (last DC solution on the
    *penalised* costs, loss history, factors); the caller re-prices the dispatch
    with the original costs through `ac_check_of_dispatch`."""
    base = net.load.p_mw.copy()
    total = float(base.sum())
    gen_rows = net.poly_cost.index[net.poly_cost.et == "gen"]
    gen_elem = net.poly_cost.loc[gen_rows, "element"].astype(int).values
    cols = ["cp1_eur_per_mw", "cp2_eur_per_mw2"]
    orig = net.poly_cost.loc[gen_rows, cols].copy()
    pf, loss, hist, sol = np.ones(len(net.gen)), 0.0, [], None
    for _ in range(iters):
        n = copy.deepcopy(net)
        n.load["p_mw"] = base * (1.0 + loss / total)
        n.poly_cost.loc[gen_rows, cols] = orig.values * pf[gen_elem][:, None]
        sol = solve_dc(n)
        if sol is None:
            return None, hist, pf
        chk = ac_check_of_dispatch(net, sol)
        if not chk.get("converged"):
            return sol, hist, pf
        new = chk["losses_mw"]
        hist.append(new)
        sens = loss_sensitivities(net, sol)
        if sens is not None:
            pf = 1.0 + damp * (penalty_factors(sens) - 1.0) + (1 - damp) * (pf - 1.0)
        if abs(new - loss) < tol_mw and len(hist) > 1:
            break
        loss = new
    return sol, hist, pf
