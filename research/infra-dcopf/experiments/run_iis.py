"""Why is the hard QP infeasible on the development stalls? An IIS of the hard QP, every round
(research/grid-linopf).

Plan and predictions I1 to I6 in LOG.md (2026-11-19, "Why is the hard QP infeasible ...", committed
before this ran).

The frozen J-m-a repair (converge.traced_slp, 30 rounds, run_elastic.setup's start) runs on the two
development cases with an AC optimum that never finish (case118 API, case73 API) with a diagnostic
hook that changes nothing. Each round, the hook rebuilds the hard QP's constraint set exactly as
vlin.solve builds it (vlin.rows plus the physical, margin-shifted and trust-box variable bounds),
writes every bound as its own labelled row, and asks HiGHS (an LP solver independent of the repair's
Clarabel) four questions:

* is the set empty as run (arm H), without the trust box (NB), without the safety margins (NM), and
  without either (NBM)?
* when H is empty and NB is not, the smallest box scale t (ptrust and vtrust times t) at which the
  set is non-empty (bisection on log t in [1, 1e4]);
* an irreducible infeasible subset (IIS) of H: the support of a phase-1 dual (Farkas) certificate,
  then a deletion filter (each row dropped in turn, kept out if the rest stays infeasible);
* the phase-1 optimum (least total violation, in each row's own units).

Reproduction gate: statuses, QP kinds and phi equal results_converge.json for both cases.

Usage: run_iis.py [case118|case73|all] (default all); writes results_iis.json and results_iis.txt.
"""
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
from pypower.idx_brch import ANGMAX, ANGMIN, BR_STATUS, F_BUS, RATE_A, T_BUS  # noqa: E402
from pypower.idx_bus import BUS_I, VMAX, VMIN  # noqa: E402
from pypower.idx_gen import GEN_BUS, PMAX, PMIN, QMAX, QMIN  # noqa: E402
from scipy.optimize import linprog  # noqa: E402

from infra_dcopf import converge, vlin  # noqa: E402

ROUNDS = 30
CASES = {"case118": ("case118_ieee", "api"), "case73": ("case73_ieee_rts", "api")}
REF = HERE / "results_converge.json"
OUT = HERE / "results_iis"
FEAS_TOL = 1e-7  # phase-1 optimum above this (summed violation, row units) counts as empty


def row_labels(ppc, lin, margin):
    """One label per row of vlin.rows(ppc, lin, margin)'s A, in its order (same bookkeeping)."""
    lay, aidx = lin["lay"], lin["aidx"]
    br, bus, g = ppc["branch"], ppc["bus"], ppc["gen"]
    nbr = br.shape[0]
    lab = []

    def add(names, lo, hi, tag):
        lo, hi = vlin.shrink(lo, hi, (margin or {}).get(tag, 0.0))
        for side, bnd in (("hi", hi), ("lo", lo)):
            ok = np.isfinite(bnd)
            lab.extend(f"{tag}:{n}:{side}" for n, k in zip(names, ok) if k)

    rate = np.concatenate([br[:, RATE_A], br[:, RATE_A]])
    on = np.concatenate([br[:, BR_STATUS], br[:, BR_STATUS]]) > 0
    keep = np.where(on & (rate > 0))[0]
    for j in keep:
        k = j % nbr
        end = "f" if j < nbr else "t"
        lab.append(f"load:br{k}({int(br[k, F_BUS])}-{int(br[k, T_BUS])}){end}:hi")
    if len(aidx):
        add([f"br{k}({int(br[k, F_BUS])}-{int(br[k, T_BUS])})" for k in aidx], br[aidx, ANGMIN], br[aidx, ANGMAX], "ang")
    add([f"bus{int(bus[i, BUS_I])}" for i in lay.pq], bus[lay.pq, VMIN], bus[lay.pq, VMAX], "v")
    lv = np.where(lay.live)[0]
    add([f"gen{k}@bus{int(g[k, GEN_BUS])}" for k in lv], g[lv, QMIN], g[lv, QMAX], "q")
    return lab


def system(ppc, lin, ptrust, vtrust, margin, box_scale=1.0):
    """The hard QP's constraints as G x <= h (labelled rows: linear rows, then every finite variable
    bound, physical and trust box separately) and a_eq x = b_eq, as vlin.solve builds them."""
    mg = margin or {}
    lay = lin["lay"]
    g, bus = ppc["gen"], ppc["bus"]
    ng, nv = lay.ng, lay.nv
    n = ng + nv
    A, u, _kind, a_eq, b_eq = vlin.rows(ppc, lin, margin)
    lab = row_labels(ppc, lin, margin)
    assert len(lab) == A.shape[0], (len(lab), A.shape)
    pmin = np.where(lay.live, g[:, PMIN], 0.0)
    pmax = np.where(lay.live, g[:, PMAX], 0.0)
    vmin, vmax = vlin.shrink(bus[lay.vrow, VMIN], bus[lay.vrow, VMAX], mg.get("v", 0.0))
    s = lay.slack
    lo_s, hi_s = vlin.shrink(pmin[s:s + 1], pmax[s:s + 1], mg.get("slack", 0.0))
    pmin[s], pmax[s] = lo_s[0], hi_s[0]
    names = [f"gen{k}@bus{int(g[k, GEN_BUS])}" + ("(slack)" if k == s else "") for k in range(ng)]
    names += [f"bus{b}" for b in lay.vbus]
    G, h = [A], [u]
    E = np.eye(n)
    phys_lo, phys_hi = np.concatenate([pmin, vmin]), np.concatenate([pmax, vmax])
    for j in range(n):
        tag = "P" if j < ng else "V"
        if j < ng and not lay.live[j]:
            tag = "Pdead"
        G += [E[j:j + 1], -E[j:j + 1]]
        h += [[phys_hi[j]], [-phys_lo[j]]]
        lab += [f"{tag}phys:{names[j]}:hi", f"{tag}phys:{names[j]}:lo"]
    x0 = np.concatenate([lin["pg0"], lin["v0"]])
    tr = []
    if ptrust is not None:
        tr += [(j, ptrust[j] * box_scale, "Pbox") for j in range(ng) if lay.live[j]]
    if vtrust is not None:
        tr += [(ng + j, vtrust[j] * box_scale, "Vbox") for j in range(nv)]
    for j, r, tag in tr:
        G += [E[j:j + 1], -E[j:j + 1]]
        h += [[x0[j] + r], [-(x0[j] - r)]]
        lab += [f"{tag}:{names[j]}:hi", f"{tag}:{names[j]}:lo"]
    return np.vstack(G), np.concatenate([np.ravel(x) for x in h]), lab, a_eq, b_eq


def phase1(G, h, a_eq, b_eq):
    """min sum of row violations s (G x - s <= h, s >= 0) plus |a_eq x - b_eq|; x free.
    Returns (optimum, ineq duals >= 0, eq dual magnitude)."""
    m, n = G.shape
    c = np.concatenate([np.zeros(n), np.ones(m), [1.0, 1.0]])
    Aub = np.hstack([G, -np.eye(m), np.zeros((m, 2))])
    Aeq = np.concatenate([a_eq, np.zeros(m), [1.0, -1.0]])[None, :]
    bounds = [(None, None)] * n + [(0, None)] * (m + 2)
    r = linprog(c, A_ub=Aub, b_ub=h, A_eq=Aeq, b_eq=[b_eq], bounds=bounds, method="highs")
    if r.status != 0:
        return float("nan"), np.zeros(m), 0.0
    return float(r.fun), -np.asarray(r.ineqlin.marginals), float(abs(r.eqlin.marginals[0]))


def empty(G, h, a_eq, b_eq):
    """Is {G x <= h, a_eq x = b_eq} empty? (phase-1 optimum above FEAS_TOL, scaled per row)."""
    sc = np.maximum(1.0, np.abs(G).max(axis=1))
    f, _, _ = phase1(G / sc[:, None], h / sc, a_eq, b_eq)
    return bool(f > FEAS_TOL), f


def iis(G, h, lab, a_eq, b_eq):
    """Farkas-support candidates, then a deletion filter. Returns (labels, eq_in, n_candidates)."""
    sc = np.maximum(1.0, np.abs(G).max(axis=1))
    Gs, hs = G / sc[:, None], h / sc
    _f, y, yeq = phase1(Gs, hs, a_eq, b_eq)
    cand = list(np.where(y > 1e-9)[0])
    n_cand = len(cand)
    keep_eq = True

    def infeasible(idx, eq):
        aeq, beq = (a_eq, b_eq) if eq else (np.zeros_like(a_eq), 0.0)
        return phase1(Gs[idx], hs[idx], aeq, beq)[0] > FEAS_TOL

    if not infeasible(cand, True):  # certificate support should already be infeasible; widen
        cand = list(range(len(lab)))
    if infeasible(cand, False):
        keep_eq = False
    i = 0
    while i < len(cand):
        trial = cand[:i] + cand[i + 1:]
        if trial and infeasible(trial, keep_eq):
            cand = trial
        else:
            i += 1
    return [lab[k] for k in cand], keep_eq, n_cand


def box_scale_needed(ppc, lin, ptrust, vtrust, margin):
    """Smallest t in [1, 1e4] (to 2 %) with the box times t giving a non-empty set; None if none."""
    def is_empty(t):
        return empty(*_sys(ppc, lin, ptrust, vtrust, margin, t))[0]
    if is_empty(1e4):
        return None
    lo, hi = 0.0, 4.0  # log10 t
    while hi - lo > 0.0086:  # 2 % in t
        mid = 0.5 * (lo + hi)
        if is_empty(10 ** mid):
            lo = mid
        else:
            hi = mid
    return 10 ** hi


def _sys(ppc, lin, ptrust, vtrust, margin, t=1.0):
    G, h, _lab, a_eq, b_eq = system(ppc, lin, ptrust, vtrust, margin, t)
    return G, h, a_eq, b_eq


def hook_iis(ppc):
    def hook(ctx):
        lin, pt, vt, mg = ctx["lin"], ctx["ptrust"], ctx["vtrust"], ctx["margin"]
        t0 = time.time()
        out = {}
        G, h, lab, a_eq, b_eq = system(ppc, lin, pt, vt, mg)
        out["H_empty"], out["H_phase1"] = empty(G, h, a_eq, b_eq)
        out["NB_empty"], out["NB_phase1"] = empty(*_sys(ppc, lin, None, None, mg))
        out["NM_empty"], out["NM_phase1"] = empty(*_sys(ppc, lin, pt, vt, None))
        out["NBM_empty"], out["NBM_phase1"] = empty(*_sys(ppc, lin, None, None, None))
        if out["H_empty"]:
            rows_, eq_in, nc = iis(G, h, lab, a_eq, b_eq)
            out.update(iis=rows_, iis_eq=bool(eq_in), iis_candidates=nc)
            if not out["NB_empty"]:
                out["box_t"] = box_scale_needed(ppc, lin, pt, vt, mg)
        out["n_rows"] = len(lab)
        out["secs"] = time.time() - t0
        return out
    return hook


def run_case(key):
    from run_elastic import setup
    name, kind = CASES[key]
    s = setup(name, kind)
    ppc, ac, start, vf = s
    t = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=ROUNDS, hook=hook_iis(ppc))
    ref = next(r for r in json.loads(REF.read_text()) if r["case"] == name and r["kind"] == kind)
    st = [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist]
    phi = [tr.get("phi") for tr in trace]
    phi_ref = [tr.get("phi") for tr in ref["trace"]]
    gate = st == ref["statuses"] and all(
        (a is None and b is None) or (a is not None and b is not None and abs(a - b) <= 1e-6 * max(1, abs(b)))
        for a, b in zip(phi, phi_ref)) and len(phi) == len(phi_ref)
    rounds = [{"it": tr["it"], "qp": tr.get("qp"), "halvings": tr["halvings"], "phi": tr.get("phi"),
               **tr.get("hook", {})} for tr in trace]
    return {"case": name, "kind": kind, "secs": time.time() - t, "gate": bool(gate), "statuses": st,
            "rounds": rounds}


def fam(label):
    return label.split(":")[0]


def summary(res):
    L = ["Hard-QP IIS on the development stalls (run_iis.py; plan in LOG.md 2026-11-19).", ""]
    for r in res:
        L.append(f"{r['case']} {r['kind'].upper()}: reproduction gate {'PASSED' if r['gate'] else 'FAILED'}; "
                 f"{len(r['rounds'])} rounds, {r['secs']:.0f} s")
        L.append("  it  qp       hv  Clarabel-hard  H     NB    NM    NBM   box_t   |IIS| families")
        for x in r["rounds"]:
            if "H_empty" not in x:
                continue
            fams = {}
            for lb in x.get("iis", []):
                fams[fam(lb)] = fams.get(fam(lb), 0) + 1
            fs = " ".join(f"{k}{v}" for k, v in sorted(fams.items())) + (" +bal" if x.get("iis_eq") else "")
            bt = x.get("box_t")
            L.append(f"  {x['it']:2d}  {x['qp']:<8} {x['halvings']:2d}  {'ok' if x['qp'] == 'hard' else 'failed':<13}"
                     f"  {'E' if x['H_empty'] else '-':<5} {'E' if x['NB_empty'] else '-':<5}"
                     f" {'E' if x['NM_empty'] else '-':<5} {'E' if x['NBM_empty'] else '-':<5}"
                     f" {('%.3g' % bt) if bt else ('-' if not x['H_empty'] else 'none'):<7} "
                     f"{len(x.get('iis', [])) if x['H_empty'] else '':<5} {fs if x['H_empty'] else ''}")
        seen = {}
        for x in r["rounds"]:
            if x.get("iis"):
                seen.setdefault(tuple(sorted(x["iis"])), []).append(x["it"])
        L.append("  distinct IIS row sets (rounds):")
        for rows_, its in seen.items():
            L.append(f"    rounds {its}:")
            for lb in rows_:
                L.append(f"      {lb}")
        L.append("")
    return "\n".join(L)


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    keys = list(CASES) if which == "all" else [which]
    res = []
    for k in keys:
        res.append(run_case(k))
        print(f"{k} done in {res[-1]['secs']:.0f} s, gate {res[-1]['gate']}", flush=True)
    if which == "all":
        OUT.with_suffix(".json").write_text(json.dumps(res, default=float, indent=1))
        OUT.with_suffix(".txt").write_text(summary(res) + "\n")
    print(summary(res))


if __name__ == "__main__":
    main()
