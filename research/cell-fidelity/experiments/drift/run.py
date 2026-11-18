"""Milestone 5zq: can cycles 2..10 forecast the two inputs 5zp fed by oracle (the non-OCP plating-overpotential drift
and the charge-capacity factor)?

    python experiments/drift/run.py rows      # per design: forecasts A, N, F, AQ, NQ, G, PQ (stdlib)
    python experiments/drift/run.py report    # H216 to H219 -> results.txt, summary.json

    D_n     = E_w,n - M_w,n                  non-OCP part of the plating-weighted plating-overpotential rise (D_2 = 0)
    D_10(l) = k_D (l - L_2), l > L_2         k_D: least-squares slope through the origin of D_n on L_n - L_2, n = 2..10
    q_10(l) = 1 + k_q (l - L_2), l > L_2     same fit of q_ch(2)/q_ch(n) - 1
    E_10(l) = k_E (l - L_2)                  same fit of E_w,n
    A  = 5zd's lever, law's factor           N  = 5zn's node lever, law's factor
    F  = (N + D_10, q_10)  primary           AQ = (A, q_10)     NQ = (N, q_10)     G = (E_10, q_10)
    PQ = 5zp's diagnosis (reads cycle 99)
All at kappa = 25.3, line through cycles 2..10 on 5zm's tables. Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


RT = _mod("rate_run", EXP / "rate" / "run.py")
OR, PL = RT.OR, RT.PL
HZ, WL, KP, SK, CN, LD, DP, B = PL.HZ, PL.WL, PL.KP, PL.SK, PL.CN, PL.LD, PL.DP, PL.B
K, TO, KAPPA, SETS = PL.K, PL.TO, PL.KAPPA, PL.SETS
VARS = ("A", "N", "F", "AQ", "NQ", "G", "PQ")
LINES = (30, 50)
TOL218, BAD218 = 0.10, 0.25
WIN217, LOSE217 = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def origin_slope(xs, ys):
    """Least-squares slope through the origin of ys on xs."""
    sxx = sum(x * x for x in xs)
    return sum(x * y for x, y in zip(xs, ys)) / sxx if sxx else 0.0


def ramp(k, l2, base=0.0):
    """l -> base + k (l - l2) for l > l2, base below."""
    return lambda l: base + k * (l - l2) if l > l2 else base


def fit10(lost, ys, lo=2, hi=K):
    """k of a through-origin fit of ys[n] (ys[0] is cycle lo, value relative to cycle lo) on L_n - L_lo, n = lo..hi."""
    l2 = lost[lo - 1]
    xs = [lost[n - 1] - l2 for n in range(lo, hi + 1)]
    return origin_slope(xs, ys[: hi - lo + 1])


def add(f, g):
    return lambda l: f(l) + g(l)


def gap_share(eA, eF, ePQ):
    return (eA - eF) / (eA - ePQ) if None not in (eA, eF, ePQ) and eA != ePQ else None


def verdicts(S, wins, n_all):
    st = list(S)
    v = PL.verdict
    n216 = sum(S[s]["e_F"] is not None and S[s]["e_A"] is not None and S[s]["e_F"] < S[s]["e_A"] for s in st)
    ok218 = sum(S[s]["qerr"] is not None and S[s]["qerr"] <= TOL218 for s in st)
    bad218 = sum(S[s]["qerr"] is None or S[s]["qerr"] > BAD218 for s in st)
    ok219 = sum(S[s]["derr"] <= 0.25 * S[s]["absM99"] for s in st)
    bad219 = sum(S[s]["derr"] > 0.5 * S[s]["absM99"] for s in st)
    return dict(H216=v(n216 >= 3, n216 <= 1), H217=v(wins >= WIN217, wins <= LOSE217),
                H218=v(ok218 >= 3, bad218 >= 3), H219=v(ok219 >= 3, bad219 >= 3),
                counts=dict(n216=n216, wins217=wins, n=n_all, ok218=ok218, bad218=bad218, ok219=ok219, bad219=bad219))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    q_ch = WL.q_ch(r["current_A"], r["t_ch"])
    f = dict(lost_mol=r["lost_mol"], q_ch=q_ch)
    d = SK.design(b, f, f)
    eta = LD.eta_of(q_ch, r["lost_mol"], b, K)
    lost, lt = r["lost_mol"], d["l_true"]
    l2 = lost[1]
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    Mw = WL.weighted_series(w, U)                           # n = 3..99
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    Dw = [e - m for e, m in zip(Ew, Mw)]
    qs = [q_ch[1] / q_ch[n - 1] - 1.0 for n in range(2, TO)]   # n = 2..99
    kD, kE, kq = fit10(lost, [0.0] + Dw), fit10(lost, [0.0] + Ew), fit10(lost, qs)
    d10, e10, q10 = ramp(kD, l2), ramp(kE, l2), ramp(kq, l2, 1.0)
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    pts_l = [lost[n - 1] for n in range(2, TO)]
    du_p = OR.oracle_du(pts_l, [0.0] + Ew)
    qm = RT.q_measured(lost, q_ch)
    t = d["t"]
    T = dict(A=t, N=RT.table(t, du_n), F=RT.table(t, add(du_n, d10), q10), AQ=RT.table(t, None, q10),
             NQ=RT.table(t, du_n, q10), G=RT.table(t, e10, q10), PQ=RT.table(t, du_p, qm))
    L99 = lost[TO - 2]
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], kD=1e3 * kD, kq=kq,
               qerr=PL.lnabs(q10(L99) / qm(L99)), q10_99=q10(L99), qM99=qm(L99),
               D99=1e3 * Dw[-1], D10_99=1e3 * d10(L99), M99=1e3 * Mw[-1], D10=1e3 * Dw[K - 3])
    for v, tt in T.items():
        out[f"e_{v}"] = PL.err(tt, lost, lt, KAPPA)
        out[f"c_{v}"] = OR.curvature(tt, lost)
    for k in LINES:
        out[f"e_F{k}"] = PL.err(T["F"], lost, lt, KAPPA, k=k)
        out[f"e_A{k}"] = PL.err(T["A"], lost, lt, KAPPA, k=k)
    return out


def rows():
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    out = [_row(r, *bals[WL.SRC.get(r["cond"], "crossset")]) for r in runs]
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    med = PL._med
    S = {}
    lt = lambda a, b: a is not None and b is not None and a < b
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        d = dict(n=len(t))
        for v in VARS:
            d[f"e_{v}"] = med(r[f"e_{v}"] for r in t)
            d[f"absc_{v}"] = med(abs(r[f"c_{v}"]) if r[f"c_{v}"] is not None else None for r in t)
        for q in ("e_F30", "e_F50", "e_A30", "e_A50", "kD", "kq", "qerr", "q10_99", "qM99", "D10", "D99", "D10_99",
                  "M99"):
            d[q] = med(r[q] for r in t)
        d["derr"] = med(abs(r["D10_99"] - r["D99"]) for r in t)
        d["absM99"] = med(abs(r["M99"]) for r in t)
        d["FbA"] = sum(lt(r["e_F"], r["e_A"]) for r in t)
        d["FbN"] = sum(lt(r["e_F"], r["e_N"]) for r in t)
        d["gap"] = gap_share(d["e_A"], d["e_F"], d["e_PQ"])
        S[st] = d
    wins = sum(lt(r["e_F"], r["e_A"]) for r in rs)
    V = verdicts(S, wins, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zq: ten-cycle forecasts of the non-OCP plating-overpotential drift (D_10) and the",
         "charge-capacity factor (q_10) fed to the law, against 5zd's lever A and 5zn's node lever N. 5zk's records,",
         "40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e_' + v:>7s}" for v in VARS)
         + f"{'F<A':>7s}{'F<N':>7s}{'gap':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'e_{v}'], 7, 3) for v in VARS)
                 + f"{d['FbA']:>4d}/{d['n']:<2d}{d['FbN']:>4d}/{d['n']:<2d}" + f(d["gap"], 7, 2))
    L += ["", f"{'set':12s}" + "".join(f"{'|c_' + v + '|':>8s}" for v in VARS)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[f'absc_{v}'], 8, 3) for v in VARS))
    L += ["", f"{'set':12s}{'e_F30':>7s}{'e_F50':>7s}{'e_A30':>7s}{'e_A50':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 7, 3) for q in ("e_F30", "e_F50", "e_A30", "e_A50")))
    L += ["", f"{'set':12s}{'kq':>8s}{'q10_99':>8s}{'qM99':>8s}{'qerr':>8s}{'kD':>9s}{'D10':>8s}{'D10_99':>8s}"
              f"{'D99':>8s}{'|M99|':>8s}{'Derr':>8s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 3) for q in ("kq", "q10_99", "qM99", "qerr")) + f(d["kD"], 9, 1)
                 + "".join(f(d[q], 8, 2) for q in ("D10", "D10_99", "D99", "absM99", "derr")))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10 unless suffixed; A = 5zd's lever,",
          " N = 5zn's node lever, F = N + D_10 with q_10, AQ = A with q_10, NQ = N with q_10, G = E_10 with q_10,",
          " PQ = 5zp's diagnosis (reads cycle 99); F<A, F<N = designs where F beats A, N; gap = (e_A - e_F)/(e_A - e_PQ);",
          " c = ln(slope of R(L_n) on n over 50..99 / over 2..10); kq = q_10's slope per mol lost; q10_99, qM99 = forecast",
          " and measured q_ch(2)/q_ch(99); qerr = |ln(q10_99/qM99)|; kD in mV per mol; D10, D99 = measured drift at",
          " cycles 10 and 99, D10_99 = its ten-cycle forecast at L_99, M99 = plating-weighted OCP rise at 99, all mV;",
          " Derr = set median |D10_99 - D99|)", "",
          f"H216 (e_F below e_A on >= 3 of 4 sets): {V['H216']} ({c['n216']}/4)",
          f"H217 (e_F < e_A on >= {WIN217} of 40 designs): {V['H217']} ({c['wins217']}/{c['n']})",
          f"H218 (|ln(q10/qM)| at 99 <= 0.10 on >= 3 of 4 sets): {V['H218']} ({c['ok218']} <= 0.10, "
          f"{c['bad218']} > 0.25)",
          f"H219 (|D10 - D| at 99 <= |M99|/4 on >= 3 of 4 sets): {V['H219']} ({c['ok219']} within, "
          f"{c['bad219']} above |M99|/2)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
