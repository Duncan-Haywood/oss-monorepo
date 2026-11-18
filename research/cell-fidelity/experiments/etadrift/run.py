"""Milestone 5zt: does tying the non-OCP plating-overpotential drift to the falling charge overpotential forecast it
from cycles 2..10 better than 5zq's straight line, and does that carry the ten-cycle forecast on LG M50?

    python experiments/etadrift/run.py rows      # per design: D forecasts, levers A, N, NS, FL, FH, FS, ND (stdlib)
    python experiments/etadrift/run.py report    # H228 to H231 -> results.txt, summary.json

    D_n       = E_w,n - M_w,n, n = 2..10 (5zq; D_2 = 0)
    eta_S(l)  = 5zs's saturating ten-cycle fit of the charge overpotential (unchanged)
    D_eta(l)  = k_eta (eta_S(L_2) - eta_S(l)), l > L_2; k_eta the least-squares slope through the origin of D_n on
                eta_S(L_2) - eta_S(L_n), n = 2..10                                          (eta-tied drift, primary)
    D_10(l)   = 5zq's through-origin line of D_n on L_n - L_2                               (line, reproduced)
    D_10H(l)  = D_10(min(l, L_10))                                                          (line held, reported)
    N  = 5zn's node lever, law's factor     NS = (N, q_S) (5zs, reproduced)
    FS = (N + D_eta, q_S) primary   FL = (N + D_10, q_S)   FH = (N + D_10H, q_S)
    ND = (N + measured D, q_S): reads cycle 99, the drift's ceiling for the node lever with q_S
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


SA = _mod("saturate_run", EXP / "saturate" / "run.py")
WN, DR = SA.WN, SA.DR
RT, PL, OR = SA.RT, SA.PL, DR.OR
WL, SK, CN, LD, DP, B = SA.WL, SA.SK, SA.CN, SA.LD, SA.DP, SA.B
K, TO, KAPPA, SETS = SA.K, SA.TO, SA.KAPPA, SA.SETS
VARS = ("A", "N", "NS", "FL", "FH", "FS", "ND")
LM50 = ("Chen2020", "OKane2022")
OK231, BAD231 = 0.03, 0.05
WIN230, LOSE230 = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def eta_tied(eS, l2, xs, ds):
    """(k, D_eta): D_eta(l) = k (eS(l2) - eS(l)) for l > l2, 0 below; k through the origin of ds on eS(l2) - eS(xs)."""
    e0 = eS(l2)
    k = DR.origin_slope([e0 - eS(x) for x in xs], ds)
    return k, (lambda l: k * (e0 - eS(l)) if l > l2 else 0.0)


def verdicts(S, wins, n_all):
    st = list(S)
    v = PL.verdict
    ok = lambda a, b: a is not None and b is not None and a < b
    n228 = sum(ok(S[s]["derrS"], S[s]["derrL"]) for s in st)
    lm = [s for s in LM50 if s in S]
    n229 = sum(ok(S[s]["e_FS"], S[s]["e_NS"]) for s in lm)
    ok231 = sum(S[s]["e_ND"] is not None and S[s]["e_ND"] <= OK231 for s in lm)
    bad231 = sum(S[s]["e_ND"] is None or S[s]["e_ND"] > BAD231 for s in lm)
    return dict(H228=v(n228 >= 3, n228 <= 1), H229=v(n229 == len(lm) == 2, n229 == 0),
                H230=v(wins >= WIN230, wins <= LOSE230), H231=v(ok231 == len(lm) == 2, bad231 == len(lm) == 2),
                counts=dict(n228=n228, n229=n229, wins230=wins, n=n_all, ok231=ok231, bad231=bad231))


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
    L10, L99 = lost[K - 1], lost[TO - 2]
    c, dd, lam, _ = SA.sat_fit(xs, etas, l2, SA.lam_grid(L10 - l2))
    eS = SA.clamp_sat(c, dd, lam, l2, hi)
    qS = WN.window_factor(lambda nl, e: LD.cap_eta(nl, b, e), n_li, l2, eS)
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    Mw = WL.weighted_series(w, U)                           # n = 3..99
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    Dall = [0.0] + [e - m for e, m in zip(Ew, Mw)]          # n = 2..99
    kD = DR.fit10(lost, Dall)
    d10 = DR.ramp(kD, l2)
    d10h = SA.hold_after(d10, L10)
    k_eta, deta = eta_tied(eS, l2, xs, Dall[: K - 1])
    pts_l = [lost[n - 1] for n in range(2, TO)]
    d_meas = OR.oracle_du(pts_l, Dall)
    t = d["t"]
    T = dict(A=t, N=RT.table(t, du_n), NS=RT.table(t, du_n, qS), FL=RT.table(t, DR.add(du_n, d10), qS),
             FH=RT.table(t, DR.add(du_n, d10h), qS), FS=RT.table(t, DR.add(du_n, deta), qS),
             ND=RT.table(t, DR.add(du_n, d_meas), qS))
    D99 = Dall[-1]
    # post hoc diagnostics of the tie along the whole run (reported only)
    eta_all = [LD.solve_eta(n_li - lost[n - 1], b, q_ch[n - 1]) for n in range(2, TO)]
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], k_eta=k_eta, kD=1e3 * kD,
               D10=1e3 * Dall[K - 2], D99=1e3 * D99, Dmax=1e3 * max(Dall, key=abs),
               DS99=1e3 * deta(L99), DL99=1e3 * d10(L99), DH99=1e3 * d10h(L99),
               derrS=1e3 * abs(deta(L99) - D99), derrL=1e3 * abs(d10(L99) - D99), derrH=1e3 * abs(d10h(L99) - D99),
               k_eta_all=DR.origin_slope([eta_all[0] - e for e in eta_all], Dall))
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
        for q in ("k_eta", "k_eta_all", "kD", "D10", "D99", "Dmax", "DS99", "DL99", "DH99", "derrS", "derrL", "derrH"):
            d[q] = med(r[q] for r in t)
        for x, y in (("FS", "A"), ("FS", "N"), ("FS", "NS"), ("FS", "FL"), ("FH", "NS"), ("ND", "NS")):
            d[f"{x}b{y}"] = sum(lt(r[f"e_{x}"], r[f"e_{y}"]) for r in t)
        S[st] = d
    wins = sum(lt(r["e_FS"], r["e_A"]) for r in rs)
    V = verdicts(S, wins, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    cmp = ("FSbA", "FSbN", "FSbNS", "FSbFL", "FHbNS", "NDbNS")
    L = ["cell-fidelity milestone 5zt: the non-OCP plating-overpotential drift tied to 5zs's saturating charge",
         "overpotential (D_eta) against 5zq's ten-cycle line (D_10) and that line held past cycle 10, fed to the node",
         "lever with q_S. 5zk's records, 40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e_' + v:>7s}" for v in VARS) + "".join(f"{k:>7s}" for k in cmp)]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'e_{v}'], 7, 3) for v in VARS)
                 + "".join(f"{d[k]:>4d}/{d['n']:<2d}" for k in cmp))
    dk = ("D10", "D99", "Dmax", "DS99", "DL99", "DH99", "derrS", "derrL", "derrH")
    L += ["", f"{'set':12s}" + "".join(f"{q:>8s}" for q in dk) + f"{'k_eta':>8s}{'k_all':>8s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 2) for q in dk) + f(d["k_eta"], 8, 3) + f(d["k_eta_all"], 8, 3))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10; A = 5zd's lever, N = 5zn's",
          " node lever with the law's factor, NS = N with 5zs's q_S; FL, FH, FS = N + D_10, D_10 held past L_10, D_eta,",
          " each with q_S; ND = N + measured D with q_S (reads cycle 99). D10, D99 = measured drift at cycles 10 and 99,",
          " Dmax = its largest-magnitude value over 2..99, DS99, DL99, DH99 = the forecasts at L_99, derrX = |DX99 - D99|,",
          " all mV; k_eta = the tie's ten-cycle slope (mV of drift per mV of eta fall), k_all = the same fitted on",
          " cycles 2..99 with the measured eta (post hoc))", "",
          f"H228 (|D_eta - D| at 99 below |D_10 - D| on >= 3 of 4 sets): {V['H228']} ({c['n228']}/4)",
          f"H229 (e_FS < e_NS on both LG M50 sets): {V['H229']} ({c['n229']}/2)",
          f"H230 (e_FS < e_A on >= {WIN230} of 40 designs): {V['H230']} ({c['wins230']}/{c['n']})",
          f"H231 (e_ND <= {OK231} on both LG M50 sets): {V['H231']} ({c['ok231']} <= {OK231}, {c['bad231']} > {BAD231})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
