"""Why do the case2869_pegase overload stalls stall? Hard-QP emptiness on every failed round of the
confirmation split's frozen repair (research/grid-linopf).

Plan and predictions D0 to D5 in LOG.md (2026-11-24, "Why do the case2869_pegase overload stalls stall?",
committed before this ran).

The frozen repair runs exactly as run_confirm._job("F", ...) runs it (PIPS DC start, load continuation,
20 rounds of vlin.slp on Clarabel with screening, warm starts). A diagnostic wrapper around vlin.solve
changes nothing: it passes every call through and, on a call for the hard QP (no elastic weight) that
fails, asks HiGHS (scipy.optimize.linprog, an LP solver independent of the repair's Clarabel) about the
same constraint set, built as vlin.solve builds it (vlin.rows plus physical, margin-shifted and trust-box
variable bounds):

  H    is the set empty as run?
  NB   ... without the trust box (physical bounds only)?
  NM   ... with the box but without the safety margins (vlin.MARGIN)?
  NBM  ... without either?
  t    the smallest box scale t (ptrust t, vtrust t) with a non-empty set, uncapped (vlin.min_box_scale's
       LP, here by constraint generation), when NB is not empty;
  TE   thermal phase-1: with every non-thermal row and bound hard and no box, margins off, the least total
       thermal excess (sum over rated branch ends of max(0, flow - rating) / rating) the linear model
       allows, and the branch ends that carry it. When TE > 0 the linear model at this point says no
       move of P and V within the physical limits relieves those branches.

TE is solved only when NBM is empty (otherwise it is 0 exactly). Every LP is solved by constraint generation (start from the rows violated at the linearisation point plus
the n rows with least slack, add every left-out row the solution breaks by more than 1e-7, repeat). A
relaxation that is infeasible proves the full set empty; a solution breaking no left-out row is the full
LP's solution, so every answer is exact (no answer is taken from an unsettled relaxation: after 40 passes
the full LP is solved).

Reproduction gate D0: statuses, QP kinds and the final point's cost equal the stored
results_confirm_parts/F_<case>_<kind>.json.

Usage: OMP_NUM_THREADS=1 diag_overload_stall.py run [cases...] | --summary
  cases as name:kind (default the three case2869_pegase kinds). Writes diag_overload_stall_parts/,
  then diag_overload_stall.json and .txt.
"""
import json
import sys
import time
import traceback
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
from pypower.idx_brch import BR_STATUS, F_BUS, RATE_A, T_BUS  # noqa: E402
from pypower.idx_bus import VMAX, VMIN  # noqa: E402
from pypower.idx_gen import PMAX, PMIN  # noqa: E402
from scipy.optimize import linprog  # noqa: E402
from scipy.sparse import csr_matrix, hstack as sphstack, identity, vstack as spvstack  # noqa: E402

from infra_dcopf import vlin  # noqa: E402

PARTS = HERE / "diag_overload_stall_parts"
OUT = HERE / "diag_overload_stall"
STORED = HERE / "results_confirm_parts"
DEFAULT = [("case2869_pegase", "typ"), ("case2869_pegase", "api"), ("case2869_pegase", "sad")]
TOLV = 1e-7       # a left-out row broken by more than this is added
FEAS_TOL = 1e-7   # phase-1 optimum above this (row-scaled units) counts as empty
MAXPASS = 40
LP_SECS = 300.0   # per HiGHS solve; a solve that hits it is reported as 'timeout', never as an answer


def bounds_of(ppc, lin, margin, ptrust, vtrust, t=1.0):
    """Variable bounds as vlin.solve builds them (physical, margin-shifted V and slack, trust box times t)."""
    mg = margin or {}
    lay = lin["lay"]
    g, bus = ppc["gen"], ppc["bus"]
    pmin = np.where(lay.live, g[:, PMIN], 0.0)
    pmax = np.where(lay.live, g[:, PMAX], 0.0)
    vmin, vmax = vlin.shrink(bus[lay.vrow, VMIN], bus[lay.vrow, VMAX], mg.get("v", 0.0))
    s = lay.slack
    lo_s, hi_s = vlin.shrink(pmin[s:s + 1], pmax[s:s + 1], mg.get("slack", 0.0))
    pmin[s], pmax[s] = lo_s[0], hi_s[0]
    pg0, v0 = lin["pg0"], lin["v0"]
    if ptrust is not None:
        pmin, pmax = np.maximum(pmin, pg0 - t * ptrust), np.minimum(pmax, pg0 + t * ptrust)
        pmin = np.minimum(pmin, pmax)
    if vtrust is not None:
        vmin, vmax = np.maximum(vmin, v0 - t * vtrust), np.minimum(vmax, v0 + t * vtrust)
        vmin = np.minimum(vmin, vmax)
    return np.concatenate([pmin, vmin]), np.concatenate([pmax, vmax])


def _lp(A, u, a_eq, b_eq, lo, hi, x0, elastic_rows=None, wts=None, extra_col=None):
    """Constraint-generation LP over rows A x <= u (dense A, row-scaled already), a_eq x = b_eq, lo <= x <= hi.
    Objective: 0 (feasibility), or sum of w_i s_i for an elastic slack s_i >= 0 on each row in elastic_rows
    (A_i x - s_i <= u_i). extra_col: (column of A, bound) for an added variable t minimised (box scale).
    Returns (status, objective, x, slacks dict row->value). status 'feasible' / 'empty' / 'error'."""
    m, n = A.shape
    el = np.zeros(m, bool)
    if elastic_rows is not None:
        el[elastic_rows] = True
    w = np.zeros(m) if wts is None else wts
    slack0 = u - A @ x0
    use = np.zeros(m, bool)
    use[slack0 < 0] = True
    use[np.argsort(slack0)[:min(m, n)]] = True
    full = False
    for _pass in range(MAXPASS + 1):
        if _pass == MAXPASS:
            use[:] = True
            full = True
        idx = np.where(use)[0]
        Au = csr_matrix(np.where(np.abs(A[idx]) > 1e-12, A[idx], 0.0))
        eli = np.where(el[idx])[0]
        ne = len(eli)
        cols = [Au]
        nx = n
        c = np.zeros(n)
        if extra_col is not None:
            cols.append(csr_matrix(extra_col[0][idx][:, None]))
            nx = n + 1
            c = np.append(c, 1.0)
        if ne:
            S = csr_matrix((-np.ones(ne), (eli, np.arange(ne))), shape=(len(idx), ne))
            cols.append(S)
            c = np.concatenate([c, w[idx][eli]])
        Aub = sphstack(cols).tocsr()
        aeq = np.concatenate([a_eq, np.zeros(nx - n + ne)])[None, :]
        bnds = list(zip(lo, hi))
        if extra_col is not None:
            bnds.append((0.0, extra_col[1]))
        bnds += [(0.0, None)] * ne
        r = linprog(c, A_ub=Aub, b_ub=u[idx], A_eq=aeq, b_eq=[b_eq], bounds=bnds, method="highs",
                    options={"time_limit": LP_SECS})
        if r.status == 1:
            return "timeout", None, None, {}
        if r.status == 2:
            return "empty", None, None, {}
        if r.status != 0:
            return "error", None, None, {"msg": r.message}
        x = r.x[:n]
        tval = r.x[n] if extra_col is not None else 0.0
        lhs = A @ x + (0.0 if extra_col is None else extra_col[0] * tval)
        sl = np.zeros(m)
        sl[idx[eli]] = r.x[nx:]
        broken = (~use) & (lhs - u - np.where(el, np.inf, 0.0) > TOLV)
        if el.any():  # an elastic left-out row breaks the LP only if it would need slack
            broken |= (~use) & el & (lhs - u > TOLV)
        if not broken.any() or full:
            return "feasible", float(r.fun), r.x[:nx], {int(i): float(sl[i]) for i in np.where(sl > 1e-9)[0]}
        use |= broken
    return "error", None, None, {}


def system(ppc, lin, margin):
    A, u, kind, a_eq, b_eq = vlin.rows(ppc, lin, margin)
    sc = np.maximum(1.0, np.abs(A).max(axis=1))
    return A / sc[:, None], u / sc, np.array(kind), a_eq, b_eq, sc


def is_empty(ppc, lin, margin, pt, vt, t=1.0):
    A, u, _k, a_eq, b_eq, _sc = system(ppc, lin, margin)
    lo, hi = bounds_of(ppc, lin, margin, pt, vt, t)
    x0 = np.clip(np.concatenate([lin["pg0"], lin["v0"]]), lo, hi)
    st, _f, _x, _s = _lp(A, u, a_eq, b_eq, lo, hi, x0)
    return st


def box_t(ppc, lin, margin, pt, vt):
    """Smallest box scale t with a non-empty set (LP in x and t, as vlin.min_box_scale), uncapped."""
    A, u, _k, a_eq, b_eq, _sc = system(ppc, lin, margin)
    lo, hi = bounds_of(ppc, lin, margin, None, None)
    lay = lin["lay"]
    x0 = np.concatenate([lin["pg0"], lin["v0"]])
    r = np.full(len(x0), np.nan)
    if pt is not None:
        r[:lay.ng] = pt
    if vt is not None:
        r[lay.ng:] = vt
    bx = np.where(np.isfinite(r) & (r > 0))[0]
    n = len(x0)
    E = np.zeros((2 * len(bx), n))
    col = np.zeros(2 * len(bx))
    hb = np.zeros(2 * len(bx))
    for k, j in enumerate(bx):
        E[2 * k, j], col[2 * k], hb[2 * k] = 1.0, -r[j], x0[j]
        E[2 * k + 1, j], col[2 * k + 1], hb[2 * k + 1] = -1.0, -r[j], -x0[j]
    AA = np.vstack([A, E])
    uu = np.concatenate([u, hb])
    cc = np.concatenate([np.zeros(A.shape[0]), col])
    st, f, x, _s = _lp(AA, uu, a_eq, b_eq, lo, hi, np.clip(x0, lo, hi), extra_col=(cc, None))
    return float(x[n]) if st == "feasible" else None


def thermal_phase1(ppc, lin):
    """Least total thermal excess (fraction of rating) with every other row hard, no box, no margins."""
    A_raw, u_raw, kind, a_eq, b_eq = vlin.rows(ppc, lin, None)
    kind = np.array(kind)
    br = ppc["branch"]
    nbr = br.shape[0]
    rate = np.concatenate([br[:, RATE_A], br[:, RATE_A]])
    on = np.concatenate([br[:, BR_STATUS], br[:, BR_STATUS]]) > 0
    keep = np.where(on & (rate > 0))[0]
    th = np.where(kind == "load")[0]
    assert len(th) == len(keep)
    # thermal rows in fraction of rating: flow / rate; other rows scaled as system() does
    sc = np.maximum(1.0, np.abs(A_raw).max(axis=1))
    sc[th] = rate[keep]
    A, u = A_raw / sc[:, None], u_raw / sc
    lo, hi = bounds_of(ppc, lin, None, None, None)
    x0 = np.clip(np.concatenate([lin["pg0"], lin["v0"]]), lo, hi)
    w = np.zeros(len(u))
    w[th] = 1.0
    st, f, _x, sl = _lp(A, u, a_eq, b_eq, lo, hi, x0, elastic_rows=th, wts=w)
    if st != "feasible":
        return {"TE_status": st}
    ends = []
    pos = {int(r): k for k, r in enumerate(th)}
    for row, val in sorted(sl.items(), key=lambda kv: -kv[1]):
        j = int(keep[pos[row]])
        k = j % nbr
        ends.append({"br": k, "end": "f" if j < nbr else "t", "fbus": int(br[k, F_BUS]), "tbus": int(br[k, T_BUS]),
                     "excess": val})
    return {"TE_status": st, "TE": f, "TE_ends": ends}


REC = []


def wrap(orig):
    def solve(p, lin, ptrust=None, vtrust=None, elastic=None, margin=None, screen=False, solver="pips",
              record=False):
        xp, xv, ok = orig(p, lin, ptrust=ptrust, vtrust=vtrust, elastic=elastic, margin=margin, screen=screen,
                          solver=solver, record=record)
        if elastic is None and not ok:
            t0 = time.time()
            d = {"n": len(REC) + 1, "has_pbox": ptrust is not None}
            try:
                d["H"] = is_empty(p, lin, margin, ptrust, vtrust)
                d["NB"] = is_empty(p, lin, margin, None, None)
                d["NM"] = is_empty(p, lin, None, ptrust, vtrust)
                d["NBM"] = is_empty(p, lin, None, None, None)
                if d["NB"] == "feasible":
                    d["t"] = box_t(p, lin, margin, ptrust, vtrust)
                if d["NBM"] == "empty":  # otherwise TE = 0 exactly: a point with no thermal excess exists
                    d.update(thermal_phase1(p, lin))
                else:
                    d.update(TE_status="feasible", TE=0.0, TE_ends=[], TE_skipped=True)
            except Exception as e:  # recorded, not hidden
                d["error"] = f"{type(e).__name__}: {e}"
                d["tb"] = traceback.format_exc()[-1500:]
            d["secs"] = time.time() - t0
            REC.append(d)
            print(f"[{p['bus'].shape[0]} buses] failed hard QP {d['n']}: H {d.get('H')} NB {d.get('NB')} NM {d.get('NM')} "
                  f"NBM {d.get('NBM')} t {d.get('t')} TE {d.get('TE', d.get('TE_status'))} {d['secs']:.0f} s",
                  file=sys.stderr, flush=True)
        return xp, xv, ok
    return solve


def part(name, kind):
    return PARTS / f"{name}_{kind}.json"


def job(j):
    name, kind = j
    f = part(name, kind)
    if f.exists():
        return json.loads(f.read_text())
    import run_confirm
    orig = vlin.solve
    vlin.solve = wrap(orig)
    REC.clear()
    t0 = time.time()
    try:
        out = run_confirm._job("F", name, kind)
    except Exception as e:
        out = {"case": name, "kind": kind, "error": f"{type(e).__name__}: {e}", "tb": traceback.format_exc()[-2000:]}
    finally:
        vlin.solve = orig
    # hard-QP failures map to rounds: every round calls the hard QP first; the failed ones are the rounds
    # whose qp is not 'hard' (elastic or QP infeasible)
    fail_rounds = [i + 1 for i, (s, q) in enumerate(zip(out.get("status", []), out.get("qp", []))) if q != "hard"]
    for d, it in zip(REC, fail_rounds):
        d["it"] = it
    out["diag"] = list(REC)
    out["diag_secs"] = time.time() - t0
    sf = STORED / f"F_{name}_{kind}.json"
    ref = json.loads(sf.read_text()) if sf.exists() else {}
    c1 = (out.get("final") or {}).get("cost")
    c0 = (ref.get("final") or {}).get("cost")
    out["gate"] = bool(out.get("status") == ref.get("status") and out.get("qp") == ref.get("qp")
                       and c1 is not None and c0 is not None and abs(c1 - c0) <= 1e-6 * abs(c0)
                       and len(REC) == len(fail_rounds))
    out["n_fail_rounds"] = len(fail_rounds)
    PARTS.mkdir(exist_ok=True)
    f.write_text(json.dumps(out, default=float))
    return out


def summary(cases):
    L = ["Why do the case2869_pegase overload stalls stall? (diag_overload_stall.py; plan in LOG.md 2026-11-24, outcome 2026-11-25)",
         "Every round whose hard QP (frozen margins, trust box) fails on Clarabel, re-asked of HiGHS:",
         "H as run, NB no box, NM no margins, NBM neither (E = empty, - = not empty); t = smallest box scale with a",
         "non-empty set; TE = least total thermal excess (fraction of rating) the linear model allows with no box",
         "and no margins, every other limit hard; ends = branch ends carrying it.", ""]
    res = []
    for name, kind in cases:
        f = part(name, kind)
        if not f.exists():
            L.append(f"{name} {kind.upper()}: not run")
            continue
        r = json.loads(f.read_text())
        res.append(r)
        fin = r.get("final") or {}
        L.append(f"{name} {kind.upper()}: gate D0 {'PASSED' if r.get('gate') else 'FAILED'}; "
                 f"{r.get('n_fail_rounds')} failed hard QPs of {len(r.get('status', []))} rounds; "
                 f"final {fin.get('n_over')} overloads, max {100 * (fin.get('max_load') or 0):.2f} %, worst branch "
                 f"{fin.get('worst_br')}; {r.get('diag_secs', 0):.0f} s")
        if "error" in r:
            L.append(f"  ERROR {r['error']}")
        L.append("  it  H  NB NM NBM  t        TE        ends (branch:end excess)")
        for d in r.get("diag", []):
            e = lambda k: "E" if d.get(k) == "empty" else ("-" if d.get(k) == "feasible" else "?")  # noqa: E731
            t = d.get("t")
            if d.get("NBM") != "empty" and d.get("NBM") != "feasible":  # TE was skipped on an unsettled NBM
                d = {**d, "TE": None, "TE_status": "?", "TE_ends": []}
            ends = " ".join(f"{x['br']}{x['end']}:{x['excess']:.4f}" for x in d.get("TE_ends", [])[:5])
            more = len(d.get("TE_ends", [])) - 5
            te = d.get("TE")
            L.append(f"  {d.get('it', '?'):>2}  {e('H')}  {e('NB')}  {e('NM')}  {e('NBM')}   "
                     f"{('%.3g' % t) if t else ('?' if d.get('NB') == 'feasible' else '-'):<8} {('%.5f' % te) if te is not None else d.get('TE_status', '?'):<9} "
                     f"{ends}{f' +{more}' if more > 0 else ''}" + (f"  ERR {d['error']}" if "error" in d else ""))
        L.append("")
    allr = [d for r in res for d in r.get("diag", []) if "error" not in d]
    n = len(allr)
    L.append(f"pooled: {n} failed hard QPs over {len(res)} cases")
    if n:
        for k in ("H", "NB", "NM", "NBM"):
            ce = sum(1 for d in allr if d.get(k) == "empty")
            cf = sum(1 for d in allr if d.get(k) == "feasible")
            L.append(f"  {k:<3}: empty {ce}, not empty {cf}, not settled (LP time limit) {n - ce - cf} of {n}")
        nm_clears = sum(1 for d in allr if d.get("H") == "empty" and d.get("NM") == "feasible")
        L.append(f"  dropping the margins alone gives a non-empty set (H empty, NM not): {nm_clears} of {n}")
        te_pos = sum(1 for d in allr if d.get("NBM") == "empty" and (d.get("TE") or 0) > 1e-6)
        te_known = sum(1 for d in allr if d.get("NBM") in ("empty", "feasible"))
        L.append(f"  thermal phase-1 positive (linear model cannot relieve every rating, no box, no margins): {te_pos} "
                 f"of {te_known} settled")
        ts = [d["t"] for d in allr if d.get("t")]
        if ts:
            L.append(f"  box scale t needed (times the round's own box), {len(ts)} settled: min {min(ts):.3g}, "
                     f"median {float(np.median(ts)):.3g}, max {max(ts):.3g}; t <= 2 on {sum(1 for x in ts if x <= 2)}")
        unsettled = sum(1 for d in allr if d.get("NB") == "feasible" and not d.get("t"))
        L.append(f"  box LP not settled where NB is not empty: {unsettled}")
    return "\n".join(L), res


def main():
    args = sys.argv[1:]
    if args and args[0] == "run":
        cases = [tuple(a.split(":")) for a in args[1:]] or DEFAULT
        with Pool(min(len(cases), 3)) as pool:
            for r in pool.imap_unordered(job, cases):
                print(r.get("case"), r.get("kind"), "gate", r.get("gate"), r.get("error", ""), flush=True)
    else:
        cases = DEFAULT
    txt, res = summary(cases)
    OUT.with_suffix(".txt").write_text(txt + "\n")
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    print(txt)


if __name__ == "__main__":
    main()
