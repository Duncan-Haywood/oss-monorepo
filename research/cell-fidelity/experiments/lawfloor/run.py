"""Milestone 7b (the law floor): with every input measured (5zu's cell 111) the ten-cycle forecast still misses
cycle-99 lithium loss by 3.2 to 3.4% on held-out LG M50 designs (7a). How does that floor fall as the law's line
window grows from 10 to 50 cycles, and does a curved term, its bend borrowed from the set's other designs, close it
at ten cycles? All 104 x-resolved designs (5zk 40, 5zy 32, 5zz 32). No new simulation.

    python experiments/lawfloor/run.py rows      # per design: e by window and by curved variant, cells 000 and 111
    python experiments/lawfloor/run.py report    # H260 to H264 -> results.txt, summary.json
    python experiments/lawfloor/run.py posthoc   # after the report: the shape of R(n) -> posthoc.txt

    R(L) = int exp(kappa du) Q0/Q dl on the cell's table (5zu's _row construction), kappa = 25.3
    L  line through R(L_n), n = 2..k, read at n = 99 and inverted (7a's forecast at k = 10)
    curved: R(n) = a + s (n + gamma n^2) through n = 2..10, gamma fixed, (a, s) by least squares
      Q  gamma from a quadratic fitted to n = 2..10 alone (free curvature)
      T  gamma = median over the same set's other designs (leave one out) of c/b, quadratic a + b n + c n^2 fitted
         to that design's own R(L_n), n = 2..99, on the same cell's table
      O  the design's own gamma from n = 2..99 (a ceiling, not a forecast)
Plan in ../../LOG.md (7b plan).
"""
import importlib.util
import json
import math
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


BU = _mod("budget_run", EXP / "budget" / "run.py")
PL, WL, B, SK = BU.PL, BU.WL, BU.B, BU.SK
SA, DR, RT, OR, WN = BU.SA, BU.DR, BU.RT, BU.OR, BU.WN
CN, LD, DP = BU.CN, BU.LD, BU.DP
K, TO, KAPPA, SETS = BU.K, BU.TO, BU.KAPPA, BU.SETS
KP = PL.KP
POOLS = (("5zk", "depth"), ("5zy", "freshnode"), ("5zz", "rangeline"))
WINDOWS = (10, 15, 20, 30, 40, 50)
CURVED = ("L", "Q", "T", "O")
CELLS2 = ("000", "111")
LM50 = ("Chen2020", "OKane2022")
INF = float("inf")


# ---------- pure helpers (stdlib; tested) ----------

def lstsq(rows, ys):
    """Least squares by normal equations (small systems); rows = feature vectors."""
    p = len(rows[0])
    A = [[sum(r[i] * r[j] for r in rows) for j in range(p)] for i in range(p)]
    v = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(p)]
    for c in range(p):                     # Gauss-Jordan with partial pivoting
        piv = max(range(c, p), key=lambda i: abs(A[i][c]))
        A[c], A[piv], v[c], v[piv] = A[piv], A[c], v[piv], v[c]
        for i in range(p):
            if i != c and A[c][c] != 0:
                f = A[i][c] / A[c][c]
                A[i] = [a - f * b for a, b in zip(A[i], A[c])]
                v[i] -= f * v[c]
    return [v[i] / A[i][i] for i in range(p)]


def gamma_fit(ns, ys):
    """gamma = c / b of the least-squares quadratic y = a + b n + c n^2 (n scaled by 100 inside for conditioning)."""
    a, b, c = lstsq([[1.0, n / 100, (n / 100) ** 2] for n in ns], ys)
    return (c / 100) / b if b != 0 else 0.0


def curved_r(ns, ys, gamma, at):
    """R at n = at from y = a + s (n + gamma n^2) fitted on (ns, ys)."""
    x = lambda n: n + gamma * n * n
    a, s = lstsq([[1.0, x(n)] for n in ns], ys)
    return a + s * x(at)


def err_of(table, r, l_true):
    try:
        l = KP.D.l_of_r(table, r)
    except ZeroDivisionError:
        return INF
    return abs(math.log(l / l_true)) if l and l > 0 else INF


def loo_median(vals, i):
    return PL._med(v for j, v in enumerate(vals) if j != i)


def med(xs):
    xs = sorted(xs)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else 0.5 * (xs[n // 2 - 1] + xs[n // 2])


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def verdicts(S):
    st = [s for s in SETS if s in S]
    e = lambda s, c, v: S[s]["e"][c][v]
    n260 = sum(S[s]["eL"]["111"]["50"] <= 0.5 * S[s]["eL"]["111"]["10"] for s in st)
    n261 = sum(e(s, "111", "Q") > e(s, "111", "L") for s in st)
    n262 = sum(e(s, "111", "T") < e(s, "111", "L") for s in st)
    lm = [e(s, "111", "T") for s in LM50 if s in S]
    n264 = sum(e(s, "000", "T") < e(s, "000", "L") for s in st)
    return dict(H260=verdict(n260 >= 3, n260 <= 1), H261=verdict(n261 >= 3, n261 <= 1),
                H262=verdict(n262 >= 3, n262 <= 1),
                H263=verdict(len(lm) == 2 and all(x <= 0.015 for x in lm), len(lm) == 2 and all(x > 0.03 for x in lm)),
                H264=verdict(n264 >= 3, n264 <= 1),
                counts=dict(n260=n260, n261=n261, n262=n262, lm263=lm, n264=n264))


# ---------- per design ----------

def tables(r, bal, ocp):
    """5zu's _row construction, cells 000 (NS) and 111 (every input measured) only."""
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
    L10 = lost[K - 1]
    c, dd, lam, _ = SA.sat_fit(xs, etas, l2, SA.lam_grid(L10 - l2))
    eS = SA.clamp_sat(c, dd, lam, l2, hi)
    qS = WN.window_factor(lambda nl, e: LD.cap_eta(nl, b, e), n_li, l2, eS)
    qM = RT.q_measured(lost, q_ch)
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    pts_l = [lost[n - 1] for n in range(2, TO)]
    e_meas = OR.oracle_du(pts_l, [0.0] + Ew)
    zero = lambda l: 0.0
    t = d["t"]
    return dict(lost=lost, lt=lt, T={"000": RT.table(t, DR.add(du_n, zero), qS), "111": RT.table(t, e_meas, qM)})


def _job(a):
    pool, r = a
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    tb = tables(r, *bals[WL.SRC.get(r["cond"], "crossset")])
    lost, lt = tb["lost"], tb["lt"]
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], pool=pool, cells={})
    for cell in CELLS2:
        ls, rs = KP.r_of(tb["T"][cell], KAPPA)
        R = [B.interp(ls, rs, lost[n - 1]) for n in range(2, TO)]      # R(L_n), n = 2..99
        n10 = list(range(2, K + 1))
        eL = {str(k): err_of((ls, rs), curved_r(list(range(2, k + 1)), R[:k - 1], 0.0, TO - 1), lt) for k in WINDOWS}
        g_own = gamma_fit(list(range(2, TO)), R)
        g_q = gamma_fit(n10, R[:K - 1])
        out["cells"][cell] = dict(eL=eL, g_own=g_own, g_q=g_q, e_Q=err_of((ls, rs), curved_r(n10, R[:K - 1], g_q, TO - 1), lt),
                                  e_O=err_of((ls, rs), curved_r(n10, R[:K - 1], g_own, TO - 1), lt),
                                  e_kp=PL.err(tb["T"][cell], lost, lt, KAPPA), R=R, ls=ls, rs=rs, lt=lt)
    return out


def rows():
    jobs = []
    for pool, d in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles", 0) >= 100:
                jobs.append((pool, r))
    with Pool(4) as p:
        out = p.map(_job, jobs)
    n10 = list(range(2, K + 1))
    for st in SETS:                                     # T: the bend borrowed from the set's other designs
        idx = [i for i, o in enumerate(out) if o["set"] == st]
        for cell in CELLS2:
            gs = [out[i]["cells"][cell]["g_own"] for i in idx]
            for k, i in enumerate(idx):
                c = out[i]["cells"][cell]
                g = loo_median(gs, k)
                c["g_T"] = g
                c["e_T"] = err_of((c["ls"], c["rs"]), curved_r(n10, c["R"][:K - 1], g, TO - 1), c["lt"])
    for o in out:
        for c in o["cells"].values():
            for key in ("R", "ls", "rs", "lt"):
                c.pop(key)
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


# ---------- report ----------

def summarise(t):
    S = dict(n=len(t), e={}, eL={}, g={}, wins={})
    for cell in CELLS2:
        cs = [r["cells"][cell] for r in t]
        S["eL"][cell] = {str(k): med(c["eL"][str(k)] for c in cs) for k in WINDOWS}
        S["e"][cell] = dict(L=S["eL"][cell]["10"], Q=med(c["e_Q"] for c in cs), T=med(c["e_T"] for c in cs),
                            O=med(c["e_O"] for c in cs))
        gs = sorted(c["g_own"] for c in cs)
        q = lambda p: gs[min(len(gs) - 1, int(p * len(gs)))]
        S["g"][cell] = dict(med=med(gs), q25=q(0.25), q75=q(0.75), gq_med=med(c["g_q"] for c in cs))
        S["wins"][cell] = sum(c["e_T"] < c["eL"]["10"] for c in cs)
    return S


def _by_set(rs):
    return {st: summarise([r for r in rs if r["set"] == st]) for st in SETS if any(r["set"] == st for r in rs)}


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    S = _by_set(rs)
    V = verdicts(S)
    f = lambda x: f"{x:8.3f}" if x is not None and x != INF else "     inf"
    L = ["cell-fidelity milestone 7b: the law floor. The all-measured forecast error e_111 (and the real ten-cycle",
         "forecast's e_000) against the law's line window, and with a curved term at ten cycles. 104 designs, set medians.", ""]
    for cell in CELLS2:
        L += [f"e_{cell} by window (line through cycles 2..k):",
              f"{'set':12s}{'n':>3s}" + "".join(f"{'k=' + str(k):>8s}" for k in WINDOWS)]
        for st, d in S.items():
            L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['eL'][cell][str(k)]) for k in WINDOWS))
        L += ["", f"e_{cell} at ten cycles, curved variants:",
              f"{'set':12s}" + "".join(f"{v:>8s}" for v in CURVED) + f"{'T<L':>7s}{'g_med':>10s}{'g_q25':>10s}{'g_q75':>10s}{'gQ_med':>10s}"]
        for st, d in S.items():
            g = d["g"][cell]
            L.append(f"{st:12s}" + "".join(f(d['e'][cell][v]) for v in CURVED) + f"{d['wins'][cell]:>4d}/{d['n']:<2d}"
                     + "".join(f"{g[x]:10.5f}" for x in ("med", "q25", "q75", "gq_med")))
        L.append("")
    for p, _ in POOLS:
        Sp = _by_set([r for r in rs if r["pool"] == p])
        L += [f"Pool {p} only: e_111 L, T, O and k=50; e_000 L, T",
              f"{'set':12s}{'n':>3s}{'111 L':>8s}{'111 T':>8s}{'111 O':>8s}{'111 k50':>8s}{'000 L':>8s}{'000 T':>8s}"]
        for st, d in Sp.items():
            L.append(f"{st:12s}{d['n']:3d}" + f(d['e']['111']['L']) + f(d['e']['111']['T']) + f(d['e']['111']['O'])
                     + f(d['eL']['111']['50']) + f(d['e']['000']['L']) + f(d['e']['000']['T']))
        L.append("")
    c = V["counts"]
    L += ["(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3. L = line through cycles 2..10 (k=10 column);",
          " Q = free quadratic on cycles 2..10; T = gamma borrowed from the set's other designs (leave one out);",
          " O = own gamma from cycles 2..99 (ceiling). gamma = c/b of R(n) = a + b n + c n^2 over cycles 2..99, per cycle;",
          " gQ = the same fitted on cycles 2..10 only. T<L = designs where T beats L)", "",
          f"H260 (e_111 at k=50 <= half of k=10 on >= 3 of 4 sets): {V['H260']} ({c['n260']}/4)",
          f"H261 (Q above L on >= 3 of 4 sets, e_111): {V['H261']} ({c['n261']}/4)",
          f"H262 (T below L on >= 3 of 4 sets, e_111): {V['H262']} ({c['n262']}/4)",
          f"H263 (T's e_111 <= 0.015 on both LG M50 sets): {V['H263']} ({', '.join(f'{x:.3f}' for x in c['lm263'])})",
          f"H264 (T below L on >= 3 of 4 sets, e_000): {V['H264']} ({c['n264']}/4)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1, default=str) + "\n")
    print("\n".join(L))


def _shape(a):
    """Post hoc (after the report, not in the plan): how R(L_n) bends over cycles 2..99 on each cell's table."""
    pool, r = a
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    tb = tables(r, *bals[WL.SRC.get(r["cond"], "crossset")])
    lost, lt = tb["lost"], tb["lt"]
    out = dict(set=SK.pset(r["cond"]), pool=pool)
    for cell in CELLS2:
        ls, rs = KP.r_of(tb["T"][cell], KAPPA)
        R = [B.interp(ls, rs, lost[n - 1]) for n in range(2, TO)]
        all_n = list(range(2, TO))
        slope = lambda lo, hi: lstsq([[1.0, n] for n in range(lo, hi + 1)], R[lo - 2:hi - 1])[1]
        out[cell] = dict(e99=err_of((ls, rs), curved_r(all_n, R, 0.0, TO - 1), lt),
                         e_late=err_of((ls, rs), curved_r(list(range(11, 21)), R[9:19], 0.0, TO - 1), lt),
                         s_early=slope(2, 10), s_mid=slope(11, 50), s_late=slope(51, 99))
        out[cell]["ratio_late"] = out[cell]["s_late"] / out[cell]["s_early"]
        out[cell]["ratio_mid"] = out[cell]["s_mid"] / out[cell]["s_early"]
    return out


def posthoc():
    jobs = []
    for pool, d in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles", 0) >= 100:
                jobs.append((pool, r))
    with Pool(4) as p:
        out = p.map(_shape, jobs)
    L = ["Post hoc, descriptive (after the 7b report, not hypothesised): the shape of R(L_n) against cycle n on each",
         "cell's table, 104 designs, set medians. e99 = a line through all of cycles 2..99 read at 99 (how far R is from",
         "a line at all); e_late = a ten-cycle line through cycles 11..20 instead of 2..10 (does skipping the first ten",
         "cycles help); s_mid/s_early, s_late/s_early = the slope of R per cycle over cycles 11..50 and 51..99 against 2..10; q25, q75 = quartiles of late/early.", ""]
    for cell in CELLS2:
        L.append(f"cell {cell}:  {'set':12s}{'e99':>8s}{'e_late':>8s}{'mid/early':>11s}{'late/early':>11s}{'q25':>8s}{'q75':>8s}")
        for st in SETS:
            t = [o[cell] for o in out if o["set"] == st]
            L.append(f"            {st:12s}" + "".join(f"{med(c[k] for c in t):8.3f}" for k in ("e99", "e_late"))
                     + "".join(f"{med(c[k] for c in t):11.3f}" for k in ("ratio_mid", "ratio_late"))
                     + "".join(f"{sorted(c['ratio_late'] for c in t)[int(p * len(t))]:8.3f}" for p in (0.25, 0.75)))
        L.append("")
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
