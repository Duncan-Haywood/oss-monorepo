"""Milestone 5zw: does a node-gain profile learned on the other designs of a set carry the cycle-99 forecast?
5zv's per-node gains, fitted on cycles 3..10, did not (OKane2022 lever error 14.8 against N's 5.9 mV). Two
leave-one-design-out levers, each held out design by design within a set:

    T: constant gains t_i = median, over the other designs of the set, of their late gains h_i (5zv's fit_gain
       over cycles 3..99; reads past cycle 10, so only ever used for other designs)
    R: the design's own ten-cycle gains relaxing toward 1,
       g_i(l) = 1 + (g_i - 1) exp(-p(l)/rho),  p(l) = max(0, (s(l) - s(L10)) / (s(L^99) - s(L10))),
       L^99 = lithium lost at cycle 99 from a least-squares line through cycles 2..10 (no DFN read past 10);
       rho on RHOS, chosen per held-out design as the value minimising the other designs' median error.

    python experiments/nodetransfer/run.py rows      # per design: h_i, NT, NR(rho) for every rho, Tself (stdlib)
    python experiments/nodetransfer/run.py report    # H240 to H243 -> results.txt, summary.json

Forecasts at kappa = 25.3, line through cycles 2..10 on 5zm's tables, q_S, no drift (5zv's pipeline). Plan in
../../LOG.md.
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


NG = _mod("nodegain_run", EXP / "nodegain" / "run.py")
BU = NG.BU
SA, WN, RT, PL, OR, WL, SK, CN, LD, DP, B = NG.SA, NG.WN, NG.RT, NG.PL, NG.OR, NG.WL, NG.SK, NG.CN, NG.LD, NG.DP, NG.B
K, TO, KAPPA, SETS = NG.K, NG.TO, NG.KAPPA, NG.SETS
INF = float("inf")
RHOS = [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, INF]
SIGN_OK, SIGN_BAD = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def line_at(ns, ys, n):
    """Least-squares line through (ns, ys), evaluated at n."""
    m = len(ns)
    mx, my = sum(ns) / m, sum(ys) / m
    sxx = sum((x - mx) ** 2 for x in ns)
    b = sum((x - mx) * (y - my) for x, y in zip(ns, ys)) / sxx
    return my + b * (n - mx)


def relax_gain(g, p, rho):
    """1 + (g - 1) exp(-p/rho), p clipped at 0; rho = inf keeps g."""
    p = max(0.0, p)
    if rho == INF:
        return g
    return 1.0 + (g - 1.0) * math.exp(-p / rho)


def relax_lever(un, xs2, w, gains, shift, s10, ds, rho):
    """R(l) = sum_i w_i [un(x_i + g_i(l) s(l)) - un(x_i + g_i(0) s(0))]."""
    prog = lambda l: (shift(l) - s10) / ds if ds else 0.0

    def at(l):
        s, p = shift(l), prog(l)
        return sum(wi * un(xi + relax_gain(gi, p, rho) * s) for wi, xi, gi in zip(w, xs2, gains))

    r0 = at(0.0)
    return lambda l: at(l) - r0


def median_profile(profiles):
    """Node-wise median of a list of equal-length gain profiles."""
    return [PL._med(p[i] for p in profiles) for i in range(len(profiles[0]))]


def pick_rho(others):
    """rho minimising the median, over the other designs, of e_NR(rho); ties -> the larger rho (closer to G)."""
    best = None
    for k, rho in enumerate(RHOS):
        m = PL._med(o[k] for o in others)
        key = (round(m, 15), -k)
        if best is None or key < best[0]:
            best = (key, rho)
    return best[1]


def verdicts(S, n_beat, n_tot):
    v = PL.verdict
    lev = [S[s]["lev"]["T"] < S[s]["lev"]["N"] for s in S]
    r_ok = [S[s]["e"]["NR"] <= min(S[s]["e"]["NS"], S[s]["e"]["NG"]) for s in S]
    o = S.get("OKane2022")
    if o:
        e0, et, ec = o["e"]["NS"], o["e"]["NT"], o["e"]["C"]
        h241 = v(et <= (e0 + ec) / 2, et > e0)
    else:
        h241 = None
    return dict(H240=v(sum(lev) >= 3, sum(lev) <= 1), H241=h241, H242=v(sum(r_ok) >= 3, sum(r_ok) <= 1),
                H243=v(n_beat >= SIGN_OK, n_beat <= SIGN_BAD),
                counts=dict(lev_better=sum(lev), r_ok=sum(r_ok), nt_beats_ns=n_beat, n=n_tot))


# ---------- rows ----------

def _ctx(r, bal, ocp):
    """5zv's _row pipeline, kept as closures for the leave-one-out pass."""
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
    qS = WN.window_factor(lambda nl, e: LD.cap_eta(nl, b, e), n_li, l2, SA.clamp_sat(c, dd, lam, l2, hi))
    U = r["u_node"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    un = lambda x: B.interp(b["g"], b["Un"], x)
    top2 = CN.x_hi(n_li - l2, b, eta)
    shift = lambda l: CN.x_hi(n_li - l, b, eta) - top2
    nn = len(xs2)
    cal = range(3, K + 1)
    ss = [shift(lost[n - 1]) for n in cal]
    gains = [NG.fit_gain(un, xs2[i], ss, [U[n - 1][i] - U[1][i] for n in cal]) for i in range(nn)]
    late = range(3, TO)
    sl = [shift(lost[n - 1]) for n in late]
    h = [NG.fit_gain(un, xs2[i], sl, [U[n - 1][i] - U[1][i] for n in late]) for i in range(nn)]
    Mw = WL.weighted_series(w, U)
    m_meas = OR.oracle_du([lost[n - 1] for n in range(2, TO)], [0.0] + Mw)
    l99, mw99 = lost[TO - 2], Mw[-1]
    t = d["t"]
    err = lambda du: PL.err(RT.table(t, du, qS), lost, lt, KAPPA)
    lev = lambda du: abs(du(l99) - du(l2) - mw99) * 1e3
    l99hat = line_at(list(ns), xs, TO - 1)
    s10 = shift(lost[K - 1])
    ds = shift(l99hat) - s10
    return dict(un=un, xs2=xs2, w=w, shift=shift, gains=gains, h=h, err=err, lev=lev, m_meas=m_meas,
                s10=s10, ds=ds, lost=lost, b=b, eta=eta, l2=l2, row=dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"]))


def _first(args):
    r, bal, ocp = args
    c = _ctx(r, bal, ocp)
    du_n = PL.node_lever(c["b"], c["eta"], c["xs2"], c["w"], c["l2"])
    du_g = NG.gain_lever(c["un"], c["xs2"], c["w"], c["gains"], c["shift"])
    du_self = NG.gain_lever(c["un"], c["xs2"], c["w"], c["h"], c["shift"])
    rl = [relax_lever(c["un"], c["xs2"], c["w"], c["gains"], c["shift"], c["s10"], c["ds"], rho) for rho in RHOS]
    out = dict(c["row"], gains=c["gains"], h=c["h"], w=c["w"], ds=c["ds"],
               e=dict(NS=c["err"](du_n), NG=c["err"](du_g), C=c["err"](c["m_meas"]), Tself=c["err"](du_self)),
               lev=dict(N=c["lev"](du_n), G=c["lev"](du_g), Tself=c["lev"](du_self)),
               e_rho=[c["err"](du) for du in rl], lev_rho=[c["lev"](du) for du in rl],
               g_check=max(abs(rl[-1](l) - du_g(l)) for l in (c["l2"], c["lost"][K - 1], c["lost"][TO - 2])))
    return out


def _second(args):
    r, bal, ocp, t = args
    c = _ctx(r, bal, ocp)
    du_t = NG.gain_lever(c["un"], c["xs2"], c["w"], t, c["shift"])
    return dict(e=c["err"](du_t), lev=c["lev"](du_t))


def rows():
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    jobs = [(r, *bals[WL.SRC.get(r["cond"], "crossset")]) for r in runs]
    with Pool(4) as pool:
        out = pool.map(_first, jobs)
        ts = []
        for i, o in enumerate(out):
            others = [p["h"] for k, p in enumerate(out) if k != i and p["set"] == o["set"]]
            ts.append(median_profile(others))
        sec = pool.map(_second, [j + (t,) for j, t in zip(jobs, ts)])
    for i, (o, s, t) in enumerate(zip(out, sec, ts)):
        o["t"] = t
        o["e"]["NT"], o["lev"]["T"] = s["e"], s["lev"]
        others = [p["e_rho"] for k, p in enumerate(out) if k != i and p["set"] == o["set"]]
        rho = pick_rho(others)
        o["rho"] = None if rho == INF else rho
        k = RHOS.index(rho)
        o["e"]["NR"], o["lev"]["R"] = o["e_rho"][k], o["lev_rho"][k]
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
        nn = len(t[0]["h"])
        hs = sorted(r["h"][-1] for r in t)
        q = lambda p: hs[min(len(hs) - 1, int(p * (len(hs) - 1) + 0.5))]
        rhos = [r["rho"] if r["rho"] is not None else INF for r in t]
        S[st] = dict(n=len(t), e={k: med(r["e"][k] for r in t) for k in ("NS", "NG", "NT", "NR", "Tself", "C")},
                     lev={k: med(r["lev"][k] for r in t) for k in ("N", "G", "T", "R", "Tself")},
                     h_node=[med(r["h"][i] for r in t) for i in range(nn)],
                     h_sep_iqr=[q(0.25), q(0.75)], rho_median=med(rhos),
                     nt_lt_ns=sum(r["e"]["NT"] < r["e"]["NS"] for r in t),
                     nr_lt_ns=sum(r["e"]["NR"] < r["e"]["NS"] for r in t))
    n_beat = sum(r["e"]["NT"] < r["e"]["NS"] for r in rs)
    V = verdicts(S, n_beat, len(rs))
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None and x != INF else "inf".rjust(w))
    L = ["cell-fidelity milestone 5zw: leave-one-design-out node-gain levers. T = the other designs' late gain profile",
         "(median), R = own ten-cycle gains relaxing toward 1 at a rate chosen on the other designs. 5zk's records,",
         "40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}{'levN':>7s}{'levG':>7s}{'levT':>7s}{'levR':>7s}{'levTs':>7s}"
         f"{'eNS':>7s}{'eNG':>7s}{'eNT':>7s}{'eNR':>7s}{'eTs':>7s}{'eC':>7s}{'rho':>6s}{'NT<NS':>7s}{'NR<NS':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['lev'][k], 7, 2) for k in ("N", "G", "T", "R", "Tself"))
                 + "".join(f(d['e'][k], 7, 3) for k in ("NS", "NG", "NT", "NR", "Tself", "C"))
                 + f(d["rho_median"], 6, 2) + f"{d['nt_lt_ns']:>7d}{d['nr_lt_ns']:>7d}")
    L += ["", "set-median late gain h by node (cycles 3..99), collector (1) to separator (20), every third node and the",
          "last; IQR of the separator node's h across designs:"]
    for st, d in S.items():
        g = d["h_node"]
        L.append(f"  {st:12s}" + " ".join(f"{x:.2f}" for x in g[::3] + [g[-1]])
                 + f"   IQR {d['h_sep_iqr'][0]:.2f}..{d['h_sep_iqr'][1]:.2f}")
    c = V["counts"]
    L += ["", "(lev = |du(L_99) - du(L_2) - Mw_99| in mV; e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through",
          " cycles 2..10, q_S, no drift; NS, NG, C as 5zv; Ts = constant gains at the design's own h (reads cycle 99,",
          " an in-sample ceiling for a constant-gain lever); rho = set median of the per-design LOO choice)", "",
          f"H240 (lever error T < N on >= 3 of 4 sets): {V['H240']} ({c['lev_better']} of {len(S)})",
          f"H241 (OKane2022 e_NT <= (e_NS + e_C)/2): {V['H241']}",
          f"H242 (e_NR <= min(e_NS, e_NG) on >= 3 of 4 sets): {V['H242']} ({c['r_ok']} of {len(S)})",
          f"H243 (NT < NS on >= {SIGN_OK} of 40): {V['H243']} ({c['nt_beats_ns']} of {c['n']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
