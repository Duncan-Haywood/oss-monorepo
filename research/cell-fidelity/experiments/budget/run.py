"""Milestone 5zu: an error budget for the ten-cycle forecast. Where does the gap between the best ten-cycle forecast
(NS) and the all-measured diagnosis (PQ) live: the node lever's OCP part, the non-OCP plating-overpotential drift, or
the charge-capacity factor? A 2 x 2 x 2 factorial, each input forecast or measured, and its Shapley split.

    python experiments/budget/run.py rows      # per design: the eight cells and the Shapley values (stdlib)
    python experiments/budget/run.py report    # H232 to H235 -> results.txt, summary.json

    M: N's node-lever OCP rise (forecast, 5zn)  or  the measured plating-weighted OCP rise Mw (5zo's oracle)
    D: no drift (forecast, as NS)                or  the measured non-OCP drift Dw = Ew - Mw (5zq)
    q: 5zs's saturating ten-cycle factor q_S     or  the measured factor q_M (5zp)
    cell "mdq" with each letter 0 = forecast, 1 = measured; 000 = NS (5zs), 010 = ND (5zt), 001 = NM (5zs),
    111 = PQ (5zp, since Mw + Dw = Ew). phi_X = Shapley value of measuring X, as the drop in e it buys
    (phi_M + phi_D + phi_q = e_000 - e_111). I_MD = e_110 - e_100 - e_010 + e_000 (the M-D interaction at q_S).
All at kappa = 25.3, line through cycles 2..10 on 5zm's tables. Plan and outcome in ../../LOG.md.
"""
import importlib.util
import itertools
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


ET = _mod("etadrift_run", EXP / "etadrift" / "run.py")
SA, DR = ET.SA, ET.DR
WN, RT, PL, OR = SA.WN, ET.RT, ET.PL, ET.OR
WL, SK, CN, LD, DP, B = ET.WL, ET.SK, ET.CN, ET.LD, ET.DP, ET.B
K, TO, KAPPA, SETS = ET.K, ET.TO, ET.KAPPA, ET.SETS
LM50 = ET.LM50
CELLS = tuple("".join(c) for c in itertools.product("01", repeat=3))
FACTORS = ("M", "D", "q")
TOL234, BAD234 = 0.01, 0.02
OK235, LOW235 = 0.01, 0.005


# ---------- pure helpers (stdlib; tested) ----------

def shapley(e):
    """Shapley values of the three switches over e[cell], cell = 'mdq' bits; phi = drop in e from measuring."""
    phi = {}
    for i, f in enumerate(FACTORS):
        others = [j for j in range(3) if j != i]
        tot = 0.0
        for bits in itertools.product((0, 1), repeat=2):
            s = sum(bits)
            w = (1 / 3) if s in (0, 2) else (1 / 6)
            c = [0, 0, 0]
            for j, b in zip(others, bits):
                c[j] = b
            off = "".join(map(str, c))
            c[i] = 1
            on = "".join(map(str, c))
            tot += w * (e[off] - e[on])
        phi[f] = tot
    return phi


def interaction_md(e):
    return e["110"] - e["100"] - e["010"] + e["000"]


def rank_of(phis, f):
    """1 = largest of the three set medians, 3 = smallest."""
    return 1 + sum(phis[g] > phis[f] for g in FACTORS if g != f)


def verdicts(S):
    v = PL.verdict
    ok = lambda s: s in S
    r232 = rank_of(S["OKane2022"]["phi"], "M") if ok("OKane2022") else None
    r233 = rank_of(S["Chen2020"]["phi"], "D") if ok("Chen2020") else None
    q = [abs(S[s]["phi"]["q"]) for s in S]
    ok234, bad234 = sum(x <= TOL234 for x in q), sum(x > BAD234 for x in q)
    lm = [s for s in LM50 if s in S]
    ok235 = sum(S[s]["absI"] >= OK235 for s in lm)
    low235 = sum(S[s]["absI"] < LOW235 for s in lm)
    return dict(H232=v(r232 == 1, r232 == 3), H233=v(r233 == 1, r233 == 3),
                H234=v(ok234 >= 3, bad234 >= 3), H235=v(ok235 == len(lm) == 2, low235 == len(lm) == 2),
                counts=dict(r232=r232, r233=r233, ok234=ok234, bad234=bad234, ok235=ok235, low235=low235))


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
    L10 = lost[K - 1]
    c, dd, lam, _ = SA.sat_fit(xs, etas, l2, SA.lam_grid(L10 - l2))
    eS = SA.clamp_sat(c, dd, lam, l2, hi)
    qS = WN.window_factor(lambda nl, e: LD.cap_eta(nl, b, e), n_li, l2, eS)
    qM = RT.q_measured(lost, q_ch)
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    Mw = WL.weighted_series(w, U)
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    pts_l = [lost[n - 1] for n in range(2, TO)]
    m_meas = OR.oracle_du(pts_l, [0.0] + Mw)
    d_meas = OR.oracle_du(pts_l, [0.0] + [e - m for e, m in zip(Ew, Mw)])
    e_meas = OR.oracle_du(pts_l, [0.0] + Ew)
    zero = lambda l: 0.0
    t = d["t"]
    e = {}
    for cell in CELLS:
        mf = m_meas if cell[0] == "1" else du_n
        df = d_meas if cell[1] == "1" else zero
        qf = qM if cell[2] == "1" else qS
        e[cell] = PL.err(RT.table(t, DR.add(mf, df), qf), lost, lt, KAPPA)
    e_pq = PL.err(RT.table(t, e_meas, qM), lost, lt, KAPPA)     # 5zp's PQ, built its way
    phi = shapley(e)
    return dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], e=e, e_PQ=e_pq, phi=phi,
                I_MD=interaction_md(e), top=max(FACTORS, key=lambda g: phi[g]))


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
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        d = dict(n=len(t), e={c: med(r["e"][c] for r in t) for c in CELLS},
                 phi={g: med(r["phi"][g] for r in t) for g in FACTORS},
                 gap=med(r["e"]["000"] - r["e"]["111"] for r in t),
                 I_MD=med(r["I_MD"] for r in t), absI=med(abs(r["I_MD"]) for r in t),
                 top={g: sum(r["top"] == g for r in t) for g in FACTORS},
                 neg={g: sum(r["phi"][g] < 0 for r in t) for g in FACTORS})
        S[st] = d
    V = verdicts(S)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zu: error budget of the ten-cycle forecast. Each of the node lever's OCP rise (M),",
         "the non-OCP plating-overpotential drift (D) and the charge-capacity factor (q) is forecast (0) or measured (1);",
         "cell mdq. 5zk's records, 40 designs, no new simulation. Set medians of e.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e' + c:>7s}" for c in CELLS)]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['e'][c], 7, 3) for c in CELLS))
    L += ["", f"{'set':12s}{'gap':>7s}{'phi_M':>7s}{'phi_D':>7s}{'phi_q':>7s}{'I_MD':>7s}{'|I_MD|':>7s}"
          f"{'topM':>6s}{'topD':>6s}{'topq':>6s}{'negM':>6s}{'negD':>6s}{'negq':>6s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + f(d["gap"], 7, 3) + "".join(f(d["phi"][g], 7, 3) for g in FACTORS)
                 + f(d["I_MD"], 7, 3) + f(d["absI"], 7, 3)
                 + "".join(f"{d['top'][g]:>6d}" for g in FACTORS) + "".join(f"{d['neg'][g]:>6d}" for g in FACTORS))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10. Cells: 000 = NS (5zs),",
          " 010 = ND (5zt), 001 = NM (5zs, but with q_S as the forecast base), 111 = PQ (5zp). gap = e_000 - e_111;",
          " phi_X = Shapley value of measuring X (drop in e), set medians of per-design values, so they need not sum",
          " to the gap's median; I_MD = e_110 - e_100 - e_010 + e_000; topX = designs where X has the largest phi,",
          " negX = designs where measuring X raises e on average)", "",
          f"H232 (phi_M the largest of three on OKane2022): {V['H232']} (rank {c['r232']})",
          f"H233 (phi_D the largest of three on Chen2020): {V['H233']} (rank {c['r233']})",
          f"H234 (|phi_q| <= {TOL234} on >= 3 of 4 sets): {V['H234']} ({c['ok234']} <= {TOL234}, {c['bad234']} > {BAD234})",
          f"H235 (|I_MD| >= {OK235} on both LG M50 sets): {V['H235']} ({c['ok235']} >= {OK235}, {c['low235']} < {LOW235})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
