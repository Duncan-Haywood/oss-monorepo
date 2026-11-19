"""Milestone 5zv: a ten-cycle per-node gain on the node lever's shift. 5zn's node lever moves every anode node's
stoichiometry by the law's uniform shift s(l); 5zu put OKane2022's largest share of the ten-cycle error in that
lever's OCP part and 5zo put its over-read at the separator-side nodes. Here each node gets a gain g_i on s,
fitted in OCP space to its measured rise over cycles 3..10 only.

    python experiments/nodegain/run.py rows      # per design: gains, levers at cycle 99, forecasts (stdlib)
    python experiments/nodegain/run.py report    # H236 to H239 -> results.txt, summary.json

    G(l)  = sum_i w_i [Un(x_i(2) + g_i s(l)) - Un(x_i(2) + g_i s(0))]   (g_i = 1 everywhere is 5zn's N)
    G4    = gains on the four separator-side nodes only, 1 elsewhere
    NS = (N, no drift, q_S) = 5zu's cell 000; NG = (G, q_S), the primary; NG4 = (G4, q_S); C = 5zu's cell 100
    (measured Mw, q_S), the ceiling. kappa = 25.3, line through cycles 2..10 on 5zm's tables. Plan in ../../LOG.md.
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


BU = _mod("budget_run", EXP / "budget" / "run.py")
ET, SA, DR, WN, RT, PL, OR = BU.ET, BU.SA, BU.DR, BU.WN, BU.RT, BU.PL, BU.OR
WL, SK, CN, LD, DP, B = BU.WL, BU.SK, BU.CN, BU.LD, BU.DP, BU.B
K, TO, KAPPA, SETS, LM50 = BU.K, BU.TO, BU.KAPPA, BU.SETS, BU.LM50
GRID = [i / 100 for i in range(301)]
NSEP = 4
SIGN_OK, SIGN_BAD = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def fit_gain(un, x2, ss, rises, grid=GRID):
    """Gain g minimising sum (un(x2 + g s) - un(x2) - rise)^2 over the calibration cycles; ties -> nearest 1."""
    u0 = un(x2)
    best = None
    for g in grid:
        sse = sum((un(x2 + g * s) - u0 - r) ** 2 for s, r in zip(ss, rises))
        key = (round(sse, 15), abs(g - 1.0))
        if best is None or key < best[0]:
            best = (key, g)
    return best[1]


def gain_lever(un, xs2, w, gains, shift):
    """G(l) for gains g_i; shift(l) = the law's uniform stoichiometry shift from cycle 2."""
    s0 = shift(0.0)
    r0 = sum(wi * un(xi + gi * s0) for wi, xi, gi in zip(w, xs2, gains))
    return lambda l: sum(wi * un(xi + gi * shift(l)) for wi, xi, gi in zip(w, xs2, gains)) - r0


def verdicts(S, n_beat, n_tot):
    v = PL.verdict
    lev = [S[s]["lev"]["G"] < S[s]["lev"]["N"] for s in S]
    o = S.get("OKane2022")
    if o:
        e0, eg, ec = o["e"]["NS"], o["e"]["NG"], o["e"]["C"]
        h237 = v(eg < e0, eg > e0)
        h238 = v(eg <= (e0 + ec) / 2, eg > e0)
    else:
        h237 = h238 = None
    return dict(H236=v(sum(lev) >= 3, sum(lev) <= 1), H237=h237, H238=h238,
                H239=v(n_beat >= SIGN_OK, n_beat <= SIGN_BAD),
                counts=dict(lev_better=sum(lev), ng_beats_ns=n_beat, n=n_tot))


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
    c, dd, lam, _ = SA.sat_fit(xs, etas, l2, SA.lam_grid(lost[K - 1] - l2))
    eS = SA.clamp_sat(c, dd, lam, l2, hi)
    qS = WN.window_factor(lambda nl, e: LD.cap_eta(nl, b, e), n_li, l2, eS)
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    un = lambda x: B.interp(b["g"], b["Un"], x)
    top2 = CN.x_hi(n_li - l2, b, eta)
    shift = lambda l: CN.x_hi(n_li - l, b, eta) - top2
    cal = range(3, K + 1)
    ss = [shift(lost[n - 1]) for n in cal]
    nn = len(xs2)
    gains = [fit_gain(un, xs2[i], ss, [U[n - 1][i] - U[1][i] for n in cal]) for i in range(nn)]
    g4 = [1.0] * (nn - NSEP) + gains[nn - NSEP:]
    du_n = PL.node_lever(b, eta, xs2, w, l2)
    du_g = gain_lever(un, xs2, w, gains, shift)
    du_g4 = gain_lever(un, xs2, w, g4, shift)
    du_1 = gain_lever(un, xs2, w, [1.0] * nn, shift)
    Mw = WL.weighted_series(w, U)
    m_meas = OR.oracle_du([lost[n - 1] for n in range(2, TO)], [0.0] + Mw)
    l99, mw99 = lost[TO - 2], Mw[-1]
    rel = lambda du: du(l99) - du(l2)
    lev = {k: abs(rel(du) - mw99) * 1e3 for k, du in (("N", du_n), ("G", du_g), ("G4", du_g4))}
    t = d["t"]
    err = lambda du: PL.err(RT.table(t, du, qS), lost, lt, KAPPA)
    e = dict(NS=err(du_n), NG=err(du_g), NG4=err(du_g4), C=err(m_meas))
    return dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], gains=gains, w=w, lev=lev, e=e,
                n_check=max(abs(du_1(l) - du_n(l)) for l in (l2, lost[K - 1], l99)))


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
        nn = len(t[0]["gains"])
        S[st] = dict(n=len(t), e={k: med(r["e"][k] for r in t) for k in ("NS", "NG", "NG4", "C")},
                     lev={k: med(r["lev"][k] for r in t) for k in ("N", "G", "G4")},
                     gain_node=[med(r["gains"][i] for r in t) for i in range(nn)],
                     gain_w=med(sum(wi * gi for wi, gi in zip(r["w"], r["gains"])) for r in t),
                     ng_lt_ns=sum(r["e"]["NG"] < r["e"]["NS"] for r in t),
                     ng4_lt_ns=sum(r["e"]["NG4"] < r["e"]["NS"] for r in t),
                     ng_lt_ng4=sum(r["e"]["NG"] < r["e"]["NG4"] for r in t))
    n_beat = sum(r["e"]["NG"] < r["e"]["NS"] for r in rs)
    V = verdicts(S, n_beat, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zv: a ten-cycle per-node gain on the node lever's shift (fitted over cycles 3..10",
         "in OCP space). 5zk's records, 40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}{'levN':>7s}{'levG':>7s}{'levG4':>7s}{'eNS':>7s}{'eNG':>7s}{'eNG4':>7s}{'eC':>7s}"
         f"{'gw':>6s}{'NG<NS':>7s}{'NG4<NS':>7s}{'NG<NG4':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['lev'][k], 7, 2) for k in ("N", "G", "G4"))
                 + "".join(f(d['e'][k], 7, 3) for k in ("NS", "NG", "NG4", "C")) + f(d["gain_w"], 6, 2)
                 + f"{d['ng_lt_ns']:>7d}{d['ng4_lt_ns']:>7d}{d['ng_lt_ng4']:>7d}")
    L += ["", "set-median gain by node, collector (1) to separator (20), every third node and the last:"]
    for st, d in S.items():
        g = d["gain_node"]
        L.append(f"  {st:12s}" + " ".join(f"{x:.2f}" for x in g[::3] + [g[-1]]))
    c = V["counts"]
    L += ["", "(lev = |du(L_99) - du(L_2) - Mw_99| in mV; e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through",
          " cycles 2..10, q_S, no drift; NS = 5zu cell 000, C = 5zu cell 100 (measured Mw, a ceiling reading cycle 99);",
          " gw = plating-weighted mean gain)", "",
          f"H236 (lever error G < N on >= 3 of 4 sets): {V['H236']} ({c['lev_better']} of {len(S)})",
          f"H237 (OKane2022 e_NG < e_NS): {V['H237']}",
          f"H238 (OKane2022 e_NG <= (e_NS + e_C)/2): {V['H238']}",
          f"H239 (NG < NS on >= {SIGN_OK} of 40): {V['H239']} ({c['ng_beats_ns']} of {c['n']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
