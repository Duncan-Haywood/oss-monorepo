"""Milestone 5zr: does the electrode-balance map, with a ten-cycle line in the charge overpotential, forecast the
capacity factor that 5zq's straight line under-read?

    python experiments/window/run.py rows      # per design: forecasts A, N, NE, AE, FE, PE (stdlib)
    python experiments/window/run.py report    # H220 to H223 -> results.txt, summary.json
    python experiments/window/run.py posthoc   # after the verdicts: the factors along the path -> posthoc.txt

    eta_n     = 5zc's solve_eta(n_Li - L_n, q_ch(n)), n = 2..10   symmetric cut-off shift putting 5r's open-circuit
                                                                  window capacity at the measured CC charge Ah
    eta_10(l) = a + s l, least squares on (L_n, eta_n), n = 2..10, clamped to [0, 0.49 (v_hi - v_lo)]
    q_E(l)    = Q_eta10(L2)(n_Li - L_2) / Q_eta10(l)(n_Li - l), l > L_2; 1 below      (window factor, the new forecast)
    q_B(l)    = the same with eta held at the law's ten-cycle mean                    (balance alone)
    A, N      = 5zd's lever and 5zn's node lever with the law's factor (reproduced)
    NE = (N, q_E) primary     AE = (A, q_E)     FE = (N + D_10, q_E)     PE = (du_P, q_E), reads cycle 99
All at kappa = 25.3, line through cycles 2..10 on 5zm's tables. Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
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


DR = _mod("drift_run", EXP / "drift" / "run.py")
RT, OR, PL = DR.RT, DR.OR, DR.PL
WL, SK, CN, LD, DP, B = PL.WL, PL.SK, PL.CN, PL.LD, PL.DP, PL.B
K, TO, KAPPA, SETS = PL.K, PL.TO, PL.KAPPA, PL.SETS
VARS = ("A", "N", "NQ", "NE", "AE", "FE", "PE", "PQ")
LINES = (30, 50)
TOL220, BAD220 = 0.10, 0.25
WIN223, LOSE223 = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def line_fit(xs, ys):
    """(a, s) of the least-squares line y = a + s x."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    s = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else 0.0
    return my - s * mx, s


def clamp_line(a, s, hi):
    """l -> a + s l clamped to [0, hi]."""
    return lambda l: max(0.0, min(hi, a + s * l))


def window_factor(cap, n_li, l2, eta):
    """q(l) = cap(n_li - l2, eta(l2)) / cap(n_li - l, eta(l)) for l > l2, 1 below; cap(n, e) the window capacity."""
    q2 = cap(n_li - l2, eta(l2))

    def q(l):
        if l <= l2:
            return 1.0
        c = cap(n_li - l, eta(l))
        return q2 / c if c > 0 else 1e9
    return q


def verdicts(S, wins, n_all):
    st = list(S)
    v = PL.verdict
    ok220 = sum(S[s]["qerrE"] is not None and S[s]["qerrE"] <= TOL220 for s in st)
    bad220 = sum(S[s]["qerrE"] is None or S[s]["qerrE"] > BAD220 for s in st)
    n221 = sum(None not in (S[s]["qerrE"], S[s]["qerr10"]) and S[s]["qerrE"] < S[s]["qerr10"] for s in st)
    n222 = sum(None not in (S[s]["e_NE"], S[s]["e_A"]) and S[s]["e_NE"] < S[s]["e_A"] for s in st)
    return dict(H220=v(ok220 >= 3, bad220 >= 3), H221=v(n221 >= 3, n221 <= 1), H222=v(n222 >= 3, n222 <= 1),
                H223=v(wins >= WIN223, wins <= LOSE223),
                counts=dict(ok220=ok220, bad220=bad220, n221=n221, n222=n222, wins223=wins, n=n_all))


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
    etas = [LD.solve_eta(n_li - lost[n - 1], b, q_ch[n - 1]) for n in ns]
    a, s = line_fit([lost[n - 1] for n in ns], etas)
    hi = 0.49 * (b["vhi"] - b["vlo"])
    cap = lambda nl, e: LD.cap_eta(nl, b, e)
    qE = window_factor(cap, n_li, l2, clamp_line(a, s, hi))
    qB = window_factor(cap, n_li, l2, lambda l: eta)
    # the ingredients of 5zq's forecasts, rebuilt with its code
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    Mw = WL.weighted_series(w, U)
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    Dw = [e - m for e, m in zip(Ew, Mw)]
    qs = [q_ch[1] / q_ch[n - 1] - 1.0 for n in range(2, TO)]
    kD, kq = DR.fit10(lost, [0.0] + Dw), DR.fit10(lost, qs)
    d10, q10 = DR.ramp(kD, l2), DR.ramp(kq, l2, 1.0)
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    du_p = OR.oracle_du([lost[n - 1] for n in range(2, TO)], [0.0] + Ew)
    qm = RT.q_measured(lost, q_ch)
    t = d["t"]
    T = dict(A=t, N=RT.table(t, du_n), NQ=RT.table(t, du_n, q10), NE=RT.table(t, du_n, qE), AE=RT.table(t, None, qE),
             FE=RT.table(t, DR.add(du_n, d10), qE), PE=RT.table(t, du_p, qE), PQ=RT.table(t, du_p, qm))
    L99, L10 = lost[TO - 2], lost[K - 1]
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], eta2=1e3 * etas[0], eta10=1e3 * etas[-1],
               s_eta=s, eta_line99=1e3 * clamp_line(a, s, hi)(L99), eta_law=1e3 * eta,
               qE99=qE(L99), qB99=qB(L99), qM99=qm(L99), q10_99=q10(L99), qE10=qE(L10), qM10=qm(L10),
               qerrE=PL.lnabs(qE(L99) / qm(L99)), qerrB=PL.lnabs(qB(L99) / qm(L99)),
               qerr10=PL.lnabs(q10(L99) / qm(L99)))
    for v, tt in T.items():
        out[f"e_{v}"] = PL.err(tt, lost, lt, KAPPA)
    for k in LINES:
        out[f"e_NE{k}"] = PL.err(T["NE"], lost, lt, KAPPA, k=k)
        out[f"e_AE{k}"] = PL.err(T["AE"], lost, lt, KAPPA, k=k)
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
    lt = lambda a, b: a is not None and b is not None and a < b
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        d = dict(n=len(t))
        for v in VARS:
            d[f"e_{v}"] = med(r[f"e_{v}"] for r in t)
        for q in ("e_NE30", "e_NE50", "e_AE30", "e_AE50", "e_A30", "e_A50", "eta2", "eta10", "eta_law", "eta_line99",
                  "qE10", "qM10", "qE99", "qB99", "qM99", "q10_99", "qerrE", "qerrB", "qerr10"):
            d[q] = med(r[q] for r in t)
        d["s_eta"] = med(r["s_eta"] for r in t)   # V per mol = mV per mmol
        d["NEbA"] = sum(lt(r["e_NE"], r["e_A"]) for r in t)
        d["NEbN"] = sum(lt(r["e_NE"], r["e_N"]) for r in t)
        d["AEbA"] = sum(lt(r["e_AE"], r["e_A"]) for r in t)
        S[st] = d
    wins = sum(lt(r["e_NE"], r["e_A"]) for r in rs)
    V = verdicts(S, wins, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zr: the electrode-balance window with a ten-cycle line in eta (q_E) as the law's",
         "capacity factor, against 5zq's straight line (q_10) and 5zp's measured factor (q_M). 5zk's records, 40 designs,",
         "no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e_' + v:>7s}" for v in VARS) + f"{'NE<A':>7s}{'NE<N':>7s}{'AE<A':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'e_{v}'], 7, 3) for v in VARS)
                 + "".join(f"{d[k]:>4d}/{d['n']:<2d}" for k in ("NEbA", "NEbN", "AEbA")))
    L += ["", f"{'set':12s}" + "".join(f"{q:>8s}" for q in ("e_NE30", "e_NE50", "e_AE30", "e_AE50", "e_A30", "e_A50"))]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 3) for q in ("e_NE30", "e_NE50", "e_AE30", "e_AE50", "e_A30",
                                                               "e_A50")))
    qk = ("qE10", "qM10", "qE99", "qB99", "q10_99", "qM99", "qerrE", "qerrB", "qerr10")
    L += ["", f"{'set':12s}" + "".join(f"{q:>8s}" for q in qk)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 3) for q in qk))
    ek = ("eta2", "eta10", "eta_law", "s_eta", "eta_line99")
    L += ["", f"{'set':12s}" + "".join(f"{q:>11s}" for q in ek)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 11, 2) for q in ek))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10 unless suffixed; A = 5zd's lever,",
          " N = 5zn's node lever, both with the law's factor; NQ = N with 5zq's q_10; NE, AE = N, A with q_E;",
          " FE = 5zq's F lever (N + D_10) with q_E; PE, PQ = 5zp's measured overpotential with q_E, q_M (read cycle 99);",
          " q_E, q_B, q_10, q_M = window, balance-only, straight-line and measured q_ch(2)/q_ch(n) at L_10 or L_99;",
          " qerrX = |ln(qX/q_M)| at L_99; eta2, eta10 = eta_n at cycles 2 and 10, eta_law = its ten-cycle mean,",
          " eta_line99 = the ten-cycle eta line at L_99, all mV; s_eta in mV per mmol lost)", "",
          f"H220 (|ln(q_E/q_M)| at 99 <= 0.10 on >= 3 of 4 sets): {V['H220']} ({c['ok220']} <= 0.10, "
          f"{c['bad220']} > 0.25)",
          f"H221 (q_E closer than q_10 on >= 3 of 4 sets): {V['H221']} ({c['n221']}/4)",
          f"H222 (e_NE below e_A on >= 3 of 4 sets): {V['H222']} ({c['n222']}/4)",
          f"H223 (e_NE < e_A on >= {WIN223} of 40 designs): {V['H223']} ({c['wins223']}/{c['n']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


def _qpath(r, bal, ocp, cycles=(10, 20, 30, 50, 75, 99)):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    q_ch = WL.q_ch(r["current_A"], r["t_ch"])
    lost = r["lost_mol"]
    eta = LD.eta_of(q_ch, lost, b, K)
    l2, n_li = lost[1], b["n_li"]
    ns = range(2, K + 1)
    a, s = line_fit([lost[n - 1] for n in ns], [LD.solve_eta(n_li - lost[n - 1], b, q_ch[n - 1]) for n in ns])
    cap = lambda nl, e: LD.cap_eta(nl, b, e)
    qE = window_factor(cap, n_li, l2, clamp_line(a, s, 0.49 * (b["vhi"] - b["vlo"])))
    qB = window_factor(cap, n_li, l2, lambda l: eta)
    qm = RT.q_measured(lost, q_ch)
    eta99 = LD.solve_eta(n_li - lost[TO - 2], b, q_ch[TO - 2])
    out = dict(set=SK.pset(r["cond"]), eta99=1e3 * eta99)
    for n in cycles:
        l = lost[n - 1]
        out[f"E{n}"], out[f"B{n}"] = PL.lnabs(qE(l) / qm(l)), PL.lnabs(qB(l) / qm(l))
        out[f"sE{n}"], out[f"sB{n}"] = qE(l) / qm(l) - 1.0, qB(l) / qm(l) - 1.0
    return out


def posthoc():
    """Post hoc, after the verdicts: signed q_E/q_M - 1 and q_B/q_M - 1 along the path, and the eta cycle 99 needs."""
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    rs = [_qpath(r, *bals[WL.SRC.get(r["cond"], "crossset")]) for r in runs]
    med = PL._med
    cyc = (10, 20, 30, 50, 75, 99)
    L = ["cell-fidelity 5zr post hoc (after the verdicts): set median signed q_X(L_n)/q_M(L_n) - 1 along the path,",
         "X = E (window with the ten-cycle eta line) or B (window with eta held at the law's mean); eta99 = the eta",
         "the cycle-99 charge Ah needs (mV), against the line's forecast in results.txt.", "",
         f"{'set':12s}{'X':>3s}" + "".join(f"{'n=' + str(n):>8s}" for n in cyc) + f"{'eta99':>9s}"]
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        for x in ("E", "B"):
            L.append(f"{st:12s}{x:>3s}" + "".join(f"{med(r[f's{x}{n}'] for r in t):8.3f}" for n in cyc)
                     + (f"{med(r['eta99'] for r in t):9.2f}" if x == "E" else ""))
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
