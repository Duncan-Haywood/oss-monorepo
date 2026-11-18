"""Milestone 5zo: is the ten-cycle forecast's remaining error in the lever or in the law's constant-rate line?

    python experiments/oracle/run.py rows      # per design: oracle forecast O, R curvature c, node split (stdlib)
    python experiments/oracle/run.py report    # H209 to H211 -> results.txt, summary.json

5zn's node lever reads the plating-weighted rise right by cycle 99 on three sets, yet its ten-cycle forecast still misses.
Feeding the law the measured rise separates the lever's share of that miss from the law's:
    du_O(l)   = linear interpolation of (L_n, Mw_n), n = 2..99, Mw_2 = 0; 0 below L_2; beyond L_99 the slope of Mw on
                L over n = 90..99                                    (an oracle lever: it reads every cycle)
    O         = 5zf's forecast at kappa = 25.3, line through cycles 2..10, du replaced by du_O
    c         = ln(s_late / s_early), slopes of R_O(L_n) on n over n = 50..99 and 2..10
    o_i       = w_i(2) [(Un(x_i(2) + s(L_10)) - Un(x_i(2))) - (u_i(10) - u_i(2))]   node over-read at cycle 10
Plan and outcome in ../../LOG.md.
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


PL = _mod("plateau_run", EXP / "plateau" / "run.py")
HZ, WL, KP, SK, CN, LD, DP, B = PL.HZ, PL.WL, PL.KP, PL.SK, PL.CN, PL.LD, PL.DP, PL.B
K, TO, KAPPA, SETS = PL.K, PL.TO, PL.KAPPA, PL.SETS
LINES = (10, 30, 50)
TOL210, BAD210 = 0.10, 0.25
NCOL = 10                 # collector half: nodes 1..10 of 20


# ---------- pure helpers (stdlib; tested) ----------

def slope(xs, ys):
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx


def oracle_du(ls_pts, ms_pts, tail=10):
    """du_O(l): linear through (L_n, Mw_n); 0 below the first point; beyond the last, the least-squares slope of the
    last `tail` points."""
    k = slope(ls_pts[-tail:], ms_pts[-tail:])

    def du(l):
        if l <= ls_pts[0]:
            return 0.0
        if l >= ls_pts[-1]:
            return ms_pts[-1] + k * (l - ls_pts[-1])
        return B.interp(ls_pts, ms_pts, l)
    return du


def curvature(t, lost, kappa=KAPPA, early=(2, 10), late=(50, TO - 1)):
    """ln(s_late / s_early) of R(L_n) on n; None if either slope is not positive."""
    ls, rs = KP.r_of(t, kappa)
    r = lambda n: B.interp(ls, rs, lost[n - 1])
    s = []
    for a, b in (early, late):
        ns = list(range(a, b + 1))
        s.append(slope(ns, [r(n) for n in ns]))
    return math.log(s[1] / s[0]) if s[0] > 0 and s[1] > 0 else None


def over_read(b, eta, xs2, w, U, lost, n=K):
    """Per-node weighted over-read o_i of the node lever at cycle n, against the measured node OCP rise."""
    un = lambda x: B.interp(b["g"], b["Un"], x)
    s = CN.x_hi(b["n_li"] - lost[n - 1], b, eta) - CN.x_hi(b["n_li"] - lost[1], b, eta)
    p = [un(x + s) - un(x) for x in xs2]
    m = [U[n - 1][i] - U[1][i] for i in range(len(xs2))]
    return [wi * (pi - mi) for wi, pi, mi in zip(w, p, m)], p, m


def col_share(o, ncol=NCOL):
    tot = sum(o)
    return sum(o[:ncol]) / tot if tot > 0 else None


def spearman(a, b):
    def rank(v):
        o = sorted(range(len(v)), key=v.__getitem__)
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rank(a), rank(b)
    try:
        return statistics.correlation(ra, rb)
    except statistics.StatisticsError:
        return None


def verdicts(S, okane_share):
    """S[set] = set medians; okane_share = collector shares on OKane2022 designs with a positive total over-read."""
    st = list(S)
    n209 = sum(S[s]["eO"] is not None and S[s]["eO"] < min(S[s]["eA"], S[s]["eN"]) for s in st)
    ok210 = sum(S[s]["absc"] is not None and S[s]["absc"] <= TOL210 for s in st)
    bad210 = sum(S[s]["absc"] is None or S[s]["absc"] > BAD210 for s in st)
    m = len(okane_share)
    hi = sum(x > 0.5 for x in okane_share)
    return dict(H209=PL.verdict(n209 >= 3, n209 <= 1), H210=PL.verdict(ok210 >= 3, bad210 >= 3),
                H211=PL.verdict(m > 0 and 3 * hi >= 2 * m, m > 0 and 3 * hi <= m),
                counts=dict(n209=n209, ok210=ok210, bad210=bad210, okane_pos=m, okane_col=hi))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    f = dict(lost_mol=r["lost_mol"], q_ch=WL.q_ch(r["current_A"], r["t_ch"]))
    d = SK.design(b, f, f)
    eta = LD.eta_of(f["q_ch"], f["lost_mol"], b, K)
    U, lost = r["u_node"], r["lost_mol"]
    w = DP.weights(r["pl_node"][1])
    xs2 = [PL.inv_un(b["g"], b["Un"], u) for u in U[1]]
    Mw = WL.weighted_series(w, U)                      # n = 3..99
    pts_l = [lost[n - 1] for n in range(2, TO)]
    pts_m = [0.0] + Mw
    du_o = oracle_du(pts_l, pts_m)
    du_n = PL.node_lever(b, eta, xs2, w, lost[1])
    to, tn = PL.with_du(d["t"], du_o), PL.with_du(d["t"], du_n)
    lt = d["l_true"]
    o, p, m = over_read(b, eta, xs2, w, U, lost)
    return dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"],
                eA=PL.err(d["t"], lost, lt, KAPPA), eN=PL.err(tn, lost, lt, KAPPA),
                **{f"eO{k}": PL.err(to, lost, lt, KAPPA, k=k) for k in LINES},
                **{f"eA{k}": PL.err(d["t"], lost, lt, KAPPA, k=k) for k in LINES[1:]},
                eW=PL.err(d["t"], lost, lt, HZ.kappa_at(Mw, WL.law_series(lambda l: CN.du_eta(l, b, eta), lost),
                                                         TO - 1)[0]),
                c=curvature(to, lost), cA=curvature(d["t"], lost), cN=curvature(tn, lost),
                o_tot=1e3 * sum(o), o_col=1e3 * sum(o[:NCOL]), share=col_share(o),
                rho_px=spearman([pi - mi for pi, mi in zip(p, m)], xs2),
                x2=xs2, o=[1e3 * v for v in o])


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
        S[st] = dict(n=len(t), eO=med(r["eO10"] for r in t),
                     **{q: med(r[q] for r in t) for q in ("eA", "eN", "eO30", "eO50", "eA30", "eA50", "eW", "c", "cA",
                                                          "cN", "o_tot", "o_col", "share", "rho_px")},
                     absc=med(abs(r["c"]) if r["c"] is not None else None for r in t),
                     pos=sum(r["o_tot"] > 0 for r in t),
                     colmaj=sum(r["share"] is not None and r["share"] > 0.5 for r in t),
                     winsO=sum(r["eO10"] is not None and r["eO10"] < min(r["eA"], r["eN"]) for r in t))
    ok = [r["share"] for r in rs if r["set"] == "OKane2022" and r["share"] is not None]
    V = verdicts(S, ok)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zo: an oracle lever (the measured plating-weighted OCP rise) fed to the forecast law,",
         "and the node lever's cycle-10 over-read split by depth. 5zk's records, 5z's 40 designs, no new simulation.",
         "Set medians.", "",
         f"{'set':12s}{'n':>3s}{'e_A':>7s}{'e_N':>7s}{'e_O':>7s}{'e_W':>7s}{'O<A,N':>7s}{'e_O30':>7s}{'e_O50':>7s}"
         f"{'e_A30':>7s}{'e_A50':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[q], 7, 3) for q in ("eA", "eN", "eO", "eW"))
                 + f"{d['winsO']:>4d}/{d['n']:<2d}" + "".join(f(d[q], 7, 3) for q in ("eO30", "eO50", "eA30", "eA50")))
    L += ["", f"{'set':12s}{'c_O':>7s}{'|c_O|':>7s}{'c_A':>7s}{'c_N':>7s}{'o_tot':>7s}{'o_col':>7s}{'share':>7s}"
              f"{'col>.5':>8s}{'rho_px':>8s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 7, 3) for q in ("c", "absc", "cA", "cN"))
                 + "".join(f(d[q], 7, 2) for q in ("o_tot", "o_col", "share"))
                 + f"{d['colmaj']:>4d}/{d['pos']:<3d}{f(d['rho_px'], 8, 2)}")
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10 unless suffixed: A = 5zd's lever,",
          " N = 5zn's node lever, O = the oracle lever du_O (reads cycle 99), W = 5zl's diagnosis (A's lever at kappa_w);",
          " O<A,N = designs where O beats both; c = ln(slope of R(L_n) on n over 50..99 / over 2..10) on each lever's R;",
          " o_tot, o_col = node lever's weighted cycle-10 over-read, all nodes and collector half (nodes 1..10), mV;",
          " share = o_col/o_tot where o_tot > 0; col>.5 = designs with share > 0.5 / designs with o_tot > 0;",
          " rho_px = Spearman over the 20 nodes of (predicted - measured cycle-10 rise) on x_i(2))", "",
          f"H209 (O below A and N on >= 3 of 4 sets): {V['H209']} ({c['n209']}/4)",
          f"H210 (|c_O| <= 0.10 on >= 3 of 4 sets): {V['H210']} ({c['ok210']} <= 0.10, {c['bad210']} > 0.25)",
          f"H211 (OKane2022: collector half > 1/2 of a positive over-read on >= 2/3): {V['H211']} "
          f"({c['okane_col']}/{c['okane_pos']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


def posthoc():
    """After the verdicts: set-median x_i(2) and over-read o_i by node (collector -> separator), and the share of a
    positive over-read in the four separator-side nodes. Not a test; -> posthoc.txt."""
    rs = json.loads((HERE / "rows.json").read_text())
    L = ["5zo post hoc (after the verdicts): set medians by node, every third node from the collector (1) to the "
         "separator (20)", ""]
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        x = [statistics.median(r["x2"][i] for r in t) for i in range(20)]
        o = [statistics.median(r["o"][i] for r in t) for i in range(20)]
        sh = [sum(r["o"][16:]) / sum(r["o"]) for r in t if sum(r["o"]) > 0]
        L += [f"{st}: x_i(2) " + " ".join(f"{v:.2f}" for v in x[::3]),
              f"{'':{len(st)}s}  o_i mV " + " ".join(f"{v:.2f}" for v in o[::3])
              + f"   separator-side 4 nodes' share of a positive over-read: "
              + (f"{statistics.median(sh):.2f} ({len(sh)} designs)" if sh else "-")]
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
