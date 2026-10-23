"""N-1 contingency screening: does a DC (linear) screen find the branch outages an AC power flow flags?

Every single line or transformer outage of a MATPOWER case is solved twice from the case's own dispatch:
once as an AC power flow (truth) and once as a DC power flow (the screen, equivalent to LODF screening).
Both are compared with the same branch ratings and the same voltage band.
"""
import warnings

import numpy as np
import pandapower as pp
import pandapower.networks as nw

warnings.filterwarnings("ignore")

CASES = {"case14": nw.case14, "case30": nw.case30, "case39": nw.case39, "case57": nw.case57,
         "case118": nw.case118}


def load_case(name):
    return CASES[name]()


def branches(net):
    """[(table, index)] of every line and two-winding transformer."""
    return [("line", i) for i in net.line.index] + [("trafo", i) for i in net.trafo.index]


def outage(net, br):
    """Return a copy of the network with branch ``br`` out of service."""
    n = pp.copy.deepcopy(net)
    getattr(n, br[0]).at[br[1], "in_service"] = False
    return n


def _flows(n):
    """(P MW, S MVA) per branch in `branches` order, from the larger-loaded end."""
    P, S = [], []
    for t, res in (("line", n.res_line), ("trafo", n.res_trafo)):
        if t == "line":
            p1, q1, p2, q2 = res.p_from_mw, res.q_from_mvar, res.p_to_mw, res.q_to_mvar
        else:
            p1, q1, p2, q2 = res.p_hv_mw, res.q_hv_mvar, res.p_lv_mw, res.q_lv_mvar
        P += list(np.maximum(p1.abs(), p2.abs()).fillna(0.0))
        S += list(np.maximum(np.hypot(p1, q1), np.hypot(p2, q2)).fillna(0.0))
    return np.array(P), np.array(S)


def ac_flows(net):
    """AC power flow: (P, S, vmin, vmax), or None when it does not converge."""
    n = pp.copy.deepcopy(net)
    try:
        pp.runpp(n, numba=False, max_iteration=30)
    except Exception:
        return None
    P, S = _flows(n)
    vm = n.res_bus.vm_pu.dropna()
    return P, S, float(vm.min()), float(vm.max())


def dc_flows(net):
    """DC power flow (lossless, flat voltage): P per branch, or None if it fails (island)."""
    n = pp.copy.deepcopy(net)
    try:
        pp.rundcpp(n)
    except Exception:
        return None
    P, _ = _flows(n)
    if not np.all(np.isfinite(P)):
        return None
    return P


def ratings(base_S, headroom, floor_frac=0.10):
    """Branch rating = (1 + headroom) x max(base-case MVA, floor), floor = floor_frac x largest base flow.

    The cases' own thermal limits are not usable here (on case118 they never bind), so the rating is a
    swept headroom over the base-case flow; the floor stops lightly loaded branches from getting a tiny rating.
    """
    floor = floor_frac * base_S.max()
    return (1.0 + headroom) * np.maximum(base_S, floor)


def run_case(name, headrooms=(0.1, 0.25, 0.5, 1.0), vband=None):
    """Solve every N-1 outage. Returns a list of dict rows (one per outage) with the raw flows kept."""
    net = load_case(name)
    base = ac_flows(net)
    bP, bS, _, _ = base
    brs = branches(net)
    vlo, vhi = vband or (float(net.bus.min_vm_pu.iloc[0]), float(net.bus.max_vm_pu.iloc[0]))
    rows = []
    for k, br in enumerate(brs):
        n = outage(net, br)
        ac = ac_flows(n)
        dc = dc_flows(n)
        rows.append({"k": k, "br": br, "ac": ac, "dc": dc})
    return {"name": name, "net": net, "base_S": bS, "base_P": bP, "rows": rows, "vband": (vlo, vhi),
            "headrooms": list(headrooms)}


def _viol(flow, rate, k):
    """Overload ratio of the worst *other* branch (the outaged one carries no flow)."""
    r = flow / rate
    r = np.delete(r, k)
    return float(r.max())


def screen_table(res, headroom, screen_margin=1.0, ac_basis="S"):
    """Confusion counts of the DC screen against AC truth at one rating headroom.

    A contingency is *flagged* by the screen if the DC MW flow on any other branch exceeds
    ``screen_margin`` x rating; it is *truly insecure* if the AC flow (MVA, or MW when ac_basis == "P")
    exceeds the rating, or the AC voltages leave the band, or the AC power flow diverges.
    Returns dict of counts and the list of per-outage (dc_ratio, ac_ratio).
    """
    rate = ratings(res["base_S"], headroom)
    vlo, vhi = res["vband"]
    tp = fp = fn = tn = 0
    n_volt_only = n_nonconv = n_dc_fail = 0
    pairs = []
    missed = []
    for r in res["rows"]:
        k = r["k"]
        ac, dc = r["ac"], r["dc"]
        if dc is None:
            n_dc_fail += 1
            flag = True  # a screen that cannot solve must flag
            dcr = np.inf
        else:
            dcr = _viol(dc, rate, k)
            flag = dcr > screen_margin
        if ac is None:
            n_nonconv += 1
            insecure, acr, volt = True, np.inf, False
        else:
            P, S, vmin, vmax = ac
            acr = _viol(S if ac_basis == "S" else P, rate, k)
            volt = vmin < vlo or vmax > vhi
            insecure = acr > 1.0 or volt
            if volt and acr <= 1.0:
                n_volt_only += 1
        pairs.append((dcr, acr))
        if flag and insecure:
            tp += 1
        elif flag and not insecure:
            fp += 1
        elif not flag and insecure:
            fn += 1
            missed.append(r["br"])
        else:
            tn += 1
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "n": len(res["rows"]), "volt_only": n_volt_only,
            "nonconv": n_nonconv, "dc_fail": n_dc_fail, "pairs": pairs, "missed": missed}


def recall_at_k(pairs, k):
    """Of the k contingencies with the largest AC overload ratio, how many are in the DC screen's top k?"""
    ac = np.array([p[1] for p in pairs])
    dc = np.array([p[0] for p in pairs])
    ac = np.where(np.isfinite(ac), ac, 1e9)
    dc = np.where(np.isfinite(dc), dc, 1e9)
    k = min(k, len(pairs))
    a = set(np.argsort(-ac)[:k])
    d = set(np.argsort(-dc)[:k])
    return len(a & d) / k
