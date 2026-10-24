"""Nodal loss penalty factors for the DC OPF, tested against the AC OPF.

The DC OPF is lossless, so it orders generators by raw marginal cost. A
generator far from the load wastes more of each MW in the wires; the classical
fix (Wood and Wollenberg, ch. 13) multiplies its marginal cost by a penalty
factor PF_i = 1 / (1 - dLoss/dP_i). Here dLoss/dP_i comes from the AC power
flow by finite difference (one MW more at generator i, the slack picks it up),
the DC OPF is re-solved with each generator's cost scaled by 1/(1 - dLoss/dP_i)
plus the losses added to load, and the resulting dispatch is evaluated by an
AC power flow at the ORIGINAL costs. The yardstick is the AC OPF cost.
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
    total = 0.0
    for _, r in net.poly_cost.iterrows():
        p = p_slack if r.et == "ext_grid" else p_gen[int(r.element)]
        total += r.cp0_eur + r.cp1_eur_per_mw * p + r.cp2_eur_per_mw2 * p * p
    return total


def _losses(n):
    return float(n.res_line.pl_mw.sum() + (n.res_trafo.pl_mw.sum() if len(n.trafo) else 0))


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


def ac_eval(net, p_gen):
    """AC power flow at fixed generator P (slack absorbs the rest); cost at the net's own costs."""
    n = copy.deepcopy(net)
    n.gen["p_mw"] = p_gen
    try:
        pp.runpp(n, init="flat", numba=False)
    except Exception:
        return None
    vm = n.res_bus.vm_pu
    return {
        "cost": gen_cost(n, n.gen.p_mw.values, float(n.res_ext_grid.p_mw.sum())),
        "losses_mw": _losses(n),
        "n_bus_v_viol": int(((vm > n.bus.max_vm_pu) | (vm < n.bus.min_vm_pu)).sum()),
        "max_line_loading": float(n.res_line.loading_percent.max()),
    }


def penalty_factors(net, p_gen, delta=1.0):
    """dLoss/dP_i for every generator at dispatch p_gen, by finite difference of
    the AC power flow (slack picks up the change). Returns an array aligned with net.gen."""
    base = copy.deepcopy(net)
    base.gen["p_mw"] = p_gen
    pp.runpp(base, init="flat", numba=False)
    l0 = _losses(base)
    s = np.zeros(len(net.gen))
    for i in range(len(net.gen)):
        n = copy.deepcopy(base)
        n.gen.loc[n.gen.index[i], "p_mw"] += delta
        pp.runpp(n, init="flat", numba=False)
        s[i] = (_losses(n) - l0) / delta
    return s


def uniform_dc(net, iters=6, tol_mw=0.05):
    """Baseline from infra-dcopf: losses fed back as a uniform load share."""
    base = net.load.p_mw.copy()
    total = float(base.sum())
    loss, sol = 0.0, None
    for _ in range(iters):
        n = copy.deepcopy(net)
        n.load["p_mw"] = base * (1.0 + loss / total)
        sol = solve_dc(n)
        if sol is None:
            return None
        chk = ac_eval(net, sol.res_gen.p_mw.values)
        if chk is None:
            return sol
        if abs(chk["losses_mw"] - loss) < tol_mw:
            break
        loss = chk["losses_mw"]
    return sol


def plf_dc(net, iters=20, tol_mw=0.05, damp=0.5):
    """DC OPF with nodal penalty factors. Each pass: scale gen i's cost curve by
    1/(1 - s_i) (s_i = dLoss/dP_i at the last dispatch), add the last AC losses
    uniformly to load, solve DC; the next linearisation point is the damped mean
    of the old and new dispatch (damp=1 oscillates on linear costs). The slack (reference) has s = 0.
    Returns (dc solution, [(losses, max |dispatch change|)] per pass, final s)."""
    base_load = net.load.p_mw.copy()
    total = float(base_load.sum())
    p_prev = uniform_dc(net)
    if p_prev is None:
        return None, [], None
    p = p_prev.res_gen.p_mw.values
    s = np.zeros(len(net.gen))
    hist, sol, loss = [], None, 0.0
    for _ in range(iters):
        try:
            s = penalty_factors(net, p)
        except Exception:
            return sol, hist, s
        n = copy.deepcopy(net)
        for i in range(len(n.gen)):
            m = (n.poly_cost.et == "gen") & (n.poly_cost.element == n.gen.index[i])
            f = 1.0 / (1.0 - s[i])
            n.poly_cost.loc[m, ["cp0_eur", "cp1_eur_per_mw", "cp2_eur_per_mw2"]] *= f
        chk = ac_eval(net, p)
        loss = chk["losses_mw"] if chk else loss
        n.load["p_mw"] = base_load * (1.0 + loss / total)
        sol = solve_dc(n)
        if sol is None:
            return None, hist, s
        p_new = sol.res_gen.p_mw.values
        hist.append((loss, float(np.abs(p_new - p).max())))
        done = np.abs(p_new - p).max() < tol_mw
        p = (1 - damp) * p + damp * p_new
        if done:
            break
    return sol, hist, s
