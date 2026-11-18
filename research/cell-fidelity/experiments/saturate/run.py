"""Milestone 5zs: does a saturating ten-cycle fit of the charge overpotential close the window factor's late
under-read (5zr), and is there any capacity-factor gain left for the node lever?

    python experiments/saturate/run.py rows      # per design: q_S, q_H, forecasts N, NE, NS, NH, NM, AS (stdlib)
    python experiments/saturate/run.py report    # H224 to H227 -> results.txt, summary.json

    eta_n     = 5zc's solve_eta(n_Li - L_n, q_ch(n)), n = 2..10 (as 5zr)
    eta_S(l)  = c + d exp(-(l - L_2)/lam), lam on a fixed log grid (0.25 .. 20 times L_10 - L_2, 60 points), c and d
                least squares for each lam, the lam of least squared error kept; clamped to [0, 0.49 (v_hi - v_lo)]
    eta_H(l)  = 5zr's ten-cycle line up to L_10, held at its L_10 value beyond                    (hold, reported)
    q_X(l)    = 5zr's window_factor with eta_X                                                     X = E (5zr), S, H
    N  = 5zn's node lever, law's factor (reproduced)   NE = (N, q_E) (5zr, reproduced)
    NS = (N, q_S) primary     NH = (N, q_H)     AS = (A, q_S)     NM = (N, q_M), reads cycle 99: the factor's ceiling
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


WN = _mod("window_run", EXP / "window" / "run.py")
DR, RT, PL = WN.DR, WN.RT, WN.PL
WL, SK, CN, LD, DP, B = WN.WL, WN.SK, WN.CN, WN.LD, WN.DP, WN.B
K, TO, KAPPA, SETS = WN.K, WN.TO, WN.KAPPA, WN.SETS
VARS = ("A", "N", "NE", "NS", "NH", "AS", "NM")
LAM_LO, LAM_HI, LAM_N = 0.25, 20.0, 60
TOL225, BAD225 = 0.05, 0.10
FLAT226, BIG226 = 0.01, 0.02
WIN227, LOSE227 = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def lam_grid(span, lo=LAM_LO, hi=LAM_HI, n=LAM_N):
    """n log-spaced decay lengths from lo*span to hi*span."""
    return [span * lo * (hi / lo) ** (i / (n - 1)) for i in range(n)]


def sat_fit(xs, ys, x0, lams):
    """(c, d, lam, sse) of y = c + d exp(-(x - x0)/lam), least squares in (c, d) for each lam, best lam kept."""
    best = None
    for lam in lams:
        zs = [math.exp(-(x - x0) / lam) for x in xs]
        c, d = WN.line_fit(zs, ys)
        sse = sum((y - c - d * z) ** 2 for y, z in zip(ys, zs))
        if best is None or sse < best[3] - 1e-18:
            best = (c, d, lam, sse)
    return best


def clamp_sat(c, d, lam, x0, hi):
    return lambda l: max(0.0, min(hi, c + d * math.exp(-(l - x0) / lam)))


def hold_after(f, x1):
    """l -> f(min(l, x1))."""
    return lambda l: f(min(l, x1))


def verdicts(S, wins, n_all):
    st = list(S)
    v = PL.verdict
    ok = lambda a, b: a is not None and b is not None and a < b
    n224 = sum(ok(S[s]["qerrS"], S[s]["qerrE"]) for s in st)
    ok225 = sum(S[s]["qerrS"] is not None and S[s]["qerrS"] <= TOL225 for s in st)
    bad225 = sum(S[s]["qerrS"] is None or S[s]["qerrS"] > BAD225 for s in st)
    gap = [abs(S[s]["e_NM"] - S[s]["e_N"]) if None not in (S[s]["e_NM"], S[s]["e_N"]) else float("inf") for s in st]
    flat = sum(g <= FLAT226 for g in gap)
    big = sum(g > BIG226 for g in gap)
    return dict(H224=v(n224 >= 3, n224 <= 1), H225=v(ok225 >= 3, bad225 >= 3), H226=v(flat >= 3, big >= 3),
                H227=v(wins >= WIN227, wins <= LOSE227),
                counts=dict(n224=n224, ok225=ok225, bad225=bad225, flat226=flat, big226=big, wins227=wins, n=n_all))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    q_ch = WL.q_ch(r["current_A"], r["t_ch"])
    f = dict(lost_mol=r["lost_mol"], q_ch=q_ch)
    d = SK.design(b, f, f)
    eta = LD.eta_of(q_ch, r["lost_mol"], b, K)
    lost, lt = r["lost_mol"], d["l_true"]
    l2, n_li = lost[1], b["n_li"]
    ns = range(2, K + 1)
    xs = [lost[n - 1] for n in ns]
    etas = [LD.solve_eta(n_li - x, b, q_ch[n - 1]) for n, x in zip(ns, xs)]
    hi = 0.49 * (b["vhi"] - b["vlo"])
    a, s = WN.line_fit(xs, etas)
    eE = WN.clamp_line(a, s, hi)
    L10, L99 = lost[K - 1], lost[TO - 2]
    c, dd, lam, _ = sat_fit(xs, etas, l2, lam_grid(L10 - l2))
    eS = clamp_sat(c, dd, lam, l2, hi)
    eH = hold_after(eE, L10)
    cap = lambda nl, e: LD.cap_eta(nl, b, e)
    qE, qS, qH = (WN.window_factor(cap, n_li, l2, e) for e in (eE, eS, eH))
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    qm = RT.q_measured(lost, q_ch)
    t = d["t"]
    T = dict(A=t, N=RT.table(t, du_n), NE=RT.table(t, du_n, qE), NS=RT.table(t, du_n, qS),
             NH=RT.table(t, du_n, qH), AS=RT.table(t, None, qS), NM=RT.table(t, du_n, qm))
    eta99 = LD.solve_eta(n_li - L99, b, q_ch[TO - 2])
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], lam_rel=lam / (L10 - l2),
               lam_edge=int(abs(lam / (L10 - l2) - LAM_HI) < 1e-9 or abs(lam / (L10 - l2) - LAM_LO) < 1e-9),
               etaS99=1e3 * eS(L99), etaE99=1e3 * eE(L99), etaH99=1e3 * eH(L99), eta99=1e3 * eta99,
               qS99=qS(L99), qE99=qE(L99), qH99=qH(L99), qM99=qm(L99),
               qerrS=PL.lnabs(qS(L99) / qm(L99)), qerrE=PL.lnabs(qE(L99) / qm(L99)),
               qerrH=PL.lnabs(qH(L99) / qm(L99)))
    for v, tt in T.items():
        out[f"e_{v}"] = PL.err(tt, lost, lt, KAPPA)
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
    lt = lambda a, b: a is not None and b is not None and a < b
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        d = dict(n=len(t))
        for v in VARS:
            d[f"e_{v}"] = med(r[f"e_{v}"] for r in t)
        for q in ("qS99", "qE99", "qH99", "qM99", "qerrS", "qerrE", "qerrH", "etaS99", "etaE99", "etaH99", "eta99",
                  "lam_rel"):
            d[q] = med(r[q] for r in t)
        d["lam_edge"] = sum(r["lam_edge"] for r in t)
        for x, y in (("NS", "A"), ("NS", "N"), ("NS", "NE"), ("NH", "N"), ("NM", "N"), ("AS", "A")):
            d[f"{x}b{y}"] = sum(lt(r[f"e_{x}"], r[f"e_{y}"]) for r in t)
        S[st] = d
    wins = sum(lt(r["e_NS"], r["e_A"]) for r in rs)
    V = verdicts(S, wins, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    cmp = ("NSbA", "NSbN", "NSbNE", "NHbN", "NMbN", "ASbA")
    L = ["cell-fidelity milestone 5zs: a saturating ten-cycle fit of the charge overpotential (q_S) and a hold at its",
         "cycle-10 line value (q_H) in 5zr's window factor, and the node lever with the measured factor (NM, the",
         "ceiling). 5zk's records, 40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e_' + v:>7s}" for v in VARS) + "".join(f"{k:>7s}" for k in cmp)]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'e_{v}'], 7, 3) for v in VARS)
                 + "".join(f"{d[k]:>4d}/{d['n']:<2d}" for k in cmp))
    qk = ("qS99", "qE99", "qH99", "qM99", "qerrS", "qerrE", "qerrH")
    L += ["", f"{'set':12s}" + "".join(f"{q:>8s}" for q in qk)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 3) for q in qk))
    ek = ("etaS99", "etaE99", "etaH99", "eta99", "lam_rel")
    L += ["", f"{'set':12s}" + "".join(f"{q:>9s}" for q in ek) + f"{'edge':>6s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 9, 2) for q in ek) + f"{d['lam_edge']:>4d}/{d['n']}")
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10; A = 5zd's lever, N = 5zn's",
          " node lever, both with the law's factor; NE = N with 5zr's q_E; NS, NH = N with q_S, q_H; AS = A with q_S;",
          " NM = N with the measured factor q_M (reads cycle 99); qerrX = |ln(qX/q_M)| at L_99; etaX99 = each eta",
          " forecast at L_99 and eta99 the eta the cycle-99 charge needs, mV; lam_rel = the fitted decay length over",
          " L_10 - L_2, edge = designs whose lam sits on a grid end)", "",
          f"H224 (q_S closer to q_M than q_E at 99 on >= 3 of 4 sets): {V['H224']} ({c['n224']}/4)",
          f"H225 (|ln(q_S/q_M)| at 99 <= {TOL225} on >= 3 of 4 sets): {V['H225']} ({c['ok225']} <= {TOL225}, "
          f"{c['bad225']} > {BAD225})",
          f"H226 (|e_NM - e_N| <= {FLAT226} on >= 3 of 4 sets): {V['H226']} ({c['flat226']} <= {FLAT226}, "
          f"{c['big226']} > {BIG226})",
          f"H227 (e_NS < e_A on >= {WIN227} of 40 designs): {V['H227']} ({c['wins227']}/{c['n']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
