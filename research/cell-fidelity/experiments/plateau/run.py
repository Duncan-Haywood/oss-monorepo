"""Milestone 5zn: does a plateau-aware lever (the law's own uniform stoichiometry shift, read at each node's cycle-2
stoichiometry on the OCP curve) reproduce the plating-weighted rise from cycle 2 and fix the ten-cycle forecast at the
physical exponent?

    python experiments/plateau/run.py rows      # per design: x_i(2), rho_node,k, forecasts N and A (stdlib)
    python experiments/plateau/run.py report    # H204 to H208 -> results.txt, summary.json

5zm found the plating-weighted OCP rise outruns the law's lever early on LG M50: the law reads dU at the top of its
uniform-stoichiometry window, on the graphite plateau, while the plating sits at other stoichiometries. Here
    x_i(2)      = Un^-1(u_i(2))                     each node's cycle-2 end-of-charge OCP inverted on the set's Un table
    s(l)        = x_hi(n_li - l; vhi - eta) - x_hi(n_li - L_2; vhi - eta)     the law's uniform shift (5zd's window top)
    dU_node(l)  = sum_i w_i(2) Un(x_i(2) + s(l)), minus its value at l = 0
    D_node,n    = dU_node(L_n) - dU_node(L_2);  rho_node,k = slope through the origin of 5zl's Mw on D_node, n = 3..k
    N           = 5zf's forecast at kappa = 25.3, line through cycles 2..10, with du replaced by dU_node
    A           = 5zm's A_10 (5zd's lever, 25.3, line through 2..10)
Only cycle 2's node state enters dU_node, so N is a ten-cycle forecast. Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
import math
import statistics
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


HZ = _mod("horizon10_run", EXP / "horizon10" / "run.py")
WL, KP, SK, CN, LD, DP, B = HZ.WL, HZ.KP, HZ.SK, HZ.CN, HZ.LD, HZ.DP, HZ.B
K, TO, KAPPA, SETS = HZ.K, HZ.TO, HZ.KAPPA, HZ.SETS
BUDGETS = (10, 20, 30, 50, TO - 1)
LGM50 = ("Chen2020", "OKane2022")
TOL204, BAD204, TOL205, BAD205 = 0.15, 0.30, 0.30, 0.60
WIN207, LOSE207 = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def inv_un(g, un, u):
    """x with Un(x) = u on a decreasing-in-x table with flat steps: invert the running-minimum envelope (first x where
    the envelope reaches u), linear between grid points, clamped to the grid."""
    env, m = [], float("inf")
    for v in un:
        m = min(m, v)
        env.append(m)
    if u >= env[0]:
        return g[0]
    if u <= env[-1]:
        return g[-1]
    for i in range(1, len(g)):
        if env[i] <= u:
            a, b = env[i - 1], env[i]
            return g[i] if a == b else g[i - 1] + (a - u) / (a - b) * (g[i] - g[i - 1])
    return g[-1]


def node_lever(b, eta, xs2, w, l2):
    """dU_node(l): the law's uniform shift from cycle 2, read at each node's cycle-2 stoichiometry, plating-weighted;
    zero at l = 0."""
    un = lambda x: B.interp(b["g"], b["Un"], x)
    top2 = CN.x_hi(b["n_li"] - l2, b, eta)

    def raw(l):
        s = CN.x_hi(b["n_li"] - l, b, eta) - top2
        return sum(wi * un(xi + s) for wi, xi in zip(w, xs2))
    r0 = raw(0.0)
    return lambda l: raw(l) - r0


def with_du(t, du):
    """5zm's (ls, du, qr) tables with du replaced."""
    ls, _, qr = t
    return ls, [du(l) for l in ls], qr


def err(t, lost, l_true, kappa, k=K):
    p = KP.forecast(t, lost, kappa, k=k)
    return abs(math.log(p / l_true)) if p and p > 0 else None


def lnabs(x):
    return abs(math.log(x)) if x and x > 0 else None


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def verdicts(S, wins, ref_w):
    """S[set] = set medians; wins = designs where N beats A; ref_w[set] = 5zl's set median error at kappa_w."""
    st = list(S)
    ok204 = sum(S[s]["lr99"] is not None and S[s]["lr99"] <= TOL204 for s in st)
    bad204 = sum(S[s]["lr99"] is None or S[s]["lr99"] > BAD204 for s in st)
    ok205 = sum(S[s]["lr10"] is not None and S[s]["lr10"] <= TOL205 for s in st)
    bad205 = sum(S[s]["lr10"] is None or S[s]["lr10"] > BAD205 for s in st)
    n206 = sum(S[s]["eN"] is not None and S[s]["eN"] < S[s]["eA"] for s in st)
    g = [S[s]["eN"] / ref_w[s] if S[s]["eN"] is not None else float("inf") for s in LGM50 if s in S]
    return dict(H204=verdict(ok204 >= 3, bad204 >= 3), H205=verdict(ok205 >= 3, bad205 >= 3),
                H206=verdict(n206 >= 3, n206 <= 1), H207=verdict(wins >= WIN207, wins <= LOSE207),
                H208=verdict(len(g) == 2 and all(x <= 1.5 for x in g), len(g) == 2 and all(x > 3 for x in g)),
                counts=dict(ok204=ok204, bad204=bad204, ok205=ok205, bad205=bad205, n206=n206, wins=wins,
                            gap=g))


def sign_p(k, n):
    """One-sided sign test P(X >= k), X ~ Bin(n, 1/2)."""
    return sum(math.comb(n, i) for i in range(k, n + 1)) / 2 ** n


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    f = dict(lost_mol=r["lost_mol"], q_ch=WL.q_ch(r["current_A"], r["t_ch"]))
    d = SK.design(b, f, f)
    eta = LD.eta_of(f["q_ch"], f["lost_mol"], b, K)
    U, lost = r["u_node"], r["lost_mol"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [inv_un(b["g"], b["Un"], u) for u in U[1]]
    du_n = node_lever(b, eta, xs2, w, lost[1])
    uw2 = sum(wi * u for wi, u in zip(w, U[1]))
    xw2 = inv_un(b["g"], b["Un"], uw2)
    du_p = node_lever(b, eta, [xw2], [1.0], lost[1])
    Mw = WL.weighted_series(w, U)
    Dn = WL.law_series(du_n, lost)
    Dl = WL.law_series(lambda l: CN.du_eta(l, b, eta), lost)
    rho = {str(k): WL.ratio(HZ.cut(Mw, k), HZ.cut(Dn, k)) for k in BUDGETS}
    tn, tp = with_du(d["t"], du_n), with_du(d["t"], du_p)
    lt = d["l_true"]
    k_w99, _ = HZ.kappa_at(Mw, Dl, TO - 1)
    r10 = rho["10"]
    return dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], rho=rho,
                x_top2=CN.x_hi(b["n_li"] - lost[1], b, eta), x_w2=xw2,
                x_spread=max(xs2) - min(xs2),
                eA=err(d["t"], lost, lt, KAPPA), eN=err(tn, lost, lt, KAPPA), eP=err(tp, lost, lt, KAPPA),
                eN10=err(tn, lost, lt, WL.clamp(KAPPA * r10)) if r10 else None,
                eW=err(d["t"], lost, lt, k_w99), k_w99=k_w99,
                d10_law=1e3 * Dl[7], d10_node=1e3 * Dn[7], mw10=1e3 * Mw[7])


def rows():
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    out = [_row(r, *bals[WL.SRC.get(r["cond"], "crossset")]) for r in runs]
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


def _med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    ref_w = {}
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        S[st] = dict(n=len(t), **{f"lr{k}": _med(lnabs(r["rho"][str(k)]) for r in t) for k in BUDGETS},
                     **{f"rho{k}": _med(r["rho"][str(k)] for r in t) for k in BUDGETS},
                     **{q: _med(r[q] for r in t) for q in ("eA", "eN", "eP", "eN10", "eW", "d10_law", "d10_node",
                                                            "mw10", "x_top2", "x_w2", "x_spread")},
                     winsN=sum(r["eN"] is not None and r["eA"] is not None and r["eN"] < r["eA"] for r in t))
        ref_w[st] = S[st]["eW"]
    wins = sum(S[s]["winsN"] for s in S)
    n = sum(S[s]["n"] for s in S)
    V = verdicts(S, wins, ref_w)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zn: a plateau-aware node lever (the law's uniform shift read at each node's cycle-2",
         "stoichiometry, plating-weighted). 5zk's records, 5z's 40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'rho' + str(k):>7s}" for k in BUDGETS)
         + f"{'|lnr10|':>8s}{'|lnr99|':>8s}{'d10law':>7s}{'d10nod':>7s}{'mw10':>6s}{'x_top':>6s}{'x_w':>6s}{'sprd':>6s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'rho{k}'], 7, 2) for k in BUDGETS)
                 + f"{f(d['lr10'], 8, 3)}{f(d['lr99'], 8, 3)}{f(d['d10_law'], 7, 2)}{f(d['d10_node'], 7, 2)}"
                 f"{f(d['mw10'], 6, 2)}{f(d['x_top2'], 6, 3)}{f(d['x_w2'], 6, 3)}{f(d['x_spread'], 6, 3)}")
    L += ["", f"{'set':12s}{'e_A':>7s}{'e_N':>7s}{'e_P':>7s}{'e_N10':>7s}{'e_W':>7s}{'N<A':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{f(d['eA'], 7, 3)}{f(d['eN'], 7, 3)}{f(d['eP'], 7, 3)}{f(d['eN10'], 7, 3)}"
                 f"{f(d['eW'], 7, 3)}{d['winsN']:>4d}/{d['n']:<2d}")
    c = V["counts"]
    L += ["", "(rho_k = slope of Mw on D_node over n = 3..k; d10 = rise from cycle 2 to 10, mV (law = 5zd's lever, node =",
          " dU_node, mw = measured plating-weighted); x_top = law's window top at cycle 2, x_w = Un^-1 of the",
          " plating-weighted cycle-2 OCP, sprd = max - min of the node x_i(2); e = |ln(L_pred(99)/L_DFN(99))|, line",
          " through cycles 2..10: A = 5zd's lever at 25.3, N = dU_node at 25.3, P = one-point variant at 25.3,",
          " N10 = dU_node at 25.3 rho_10, W = 5zl's diagnosis (5zd's lever at kappa_w, reads cycle 99))", "",
          f"H204 (|ln rho_node,99| <= 0.15 on >= 3 of 4 sets): {V['H204']} ({c['ok204']} <= 0.15, {c['bad204']} > 0.3)",
          f"H205 (|ln rho_node,10| <= 0.3 on >= 3 of 4 sets): {V['H205']} ({c['ok205']} <= 0.3, {c['bad205']} > 0.6)",
          f"H206 (N below A on >= 3 of 4 sets): {V['H206']} ({c['n206']}/4)",
          f"H207 (N beats A on >= 26 of 40 designs): {V['H207']} ({wins}/{n}, one-sided sign test p = "
          f"{sign_p(wins, n):.3g})",
          f"H208 (LG M50: e_N <= 1.5 x e_W on both): {V['H208']} (ratios "
          + ", ".join(f"{x:.2f}" for x in c["gap"]) + ")"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V, wins=wins, n=n), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
