"""Milestone 5zp: does the law's line bend because it holds the plating overpotential's non-OCP part, or the capacity
factor, at cycle 2? Or is the bend 5zm's coarse table?

    python experiments/rate/run.py rows      # per design: forecasts O, P, OQ, PQ, O_fine and their curvatures (stdlib)
    python experiments/rate/run.py report    # H212 to H215 -> results.txt, summary.json

5zo fed the law the measured plating-weighted OCP rise (oracle O) and its line in R against cycle number still bent.
With du measured, two inputs remain in their cycle-2..10 form; both are replaced here by what the DFN did:
    E_w,n   = sum_i w_i(2) (eta_pl,i(n) - eta_pl,i(2))    plating-weighted rise of the end-of-charge plating overpotential
    du_P    = 5zo's oracle_du on (L_n, E_w,n), n = 2..99  (the full kinetic driving force, not only its OCP part)
    q_M(l)  = linear through (L_n, q_ch(2)/q_ch(n)), n = 2..99; 1 below L_2; tail slope beyond L_99
              (the measured charge-capacity factor in place of the law's Q_eta(0)/Q_eta(l))
    O, P, OQ, PQ = 5zf's forecast at kappa = 25.3, line through cycles 2..10, with (du, qr) = (du_O, law), (du_P, law),
              (du_O, q_M), (du_P, q_M); O_fine = O on the same span with 600 cells instead of 60
    c       = 5zo's ln(s_late / s_early) of R(L_n) on n, n = 50..99 against 2..10
All of these read cycle 99: diagnoses, not forecasts. Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
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


OR = _mod("oracle_run", EXP / "oracle" / "run.py")
PL, HZ, WL, KP, SK, CN, LD, DP, B = OR.PL, OR.HZ, OR.WL, OR.KP, OR.SK, OR.CN, OR.LD, OR.DP, OR.B
K, TO, KAPPA, SETS = OR.K, OR.TO, OR.KAPPA, OR.SETS
LINES = (10, 30, 50)
FINE = 600
TOL215, BAD215 = 0.02, 0.05
VARS = ("O", "P", "OQ", "PQ", "Of", "Pf")


# ---------- pure helpers (stdlib; tested) ----------

def series_fn(xs, ys, below, tail=10):
    """Linear through (xs, ys); `below` under the first point; beyond the last, the least-squares slope of the last
    `tail` points."""
    k = OR.slope(xs[-tail:], ys[-tail:])

    def f(l):
        if l <= xs[0]:
            return below
        if l >= xs[-1]:
            return ys[-1] + k * (l - xs[-1])
        return B.interp(xs, ys, l)
    return f


def q_measured(lost, q_ch, lo=2, hi=TO - 1):
    """q_M(l): the measured charge-capacity factor q_ch(lo)/q_ch(n) against L_n, 1 below L_lo."""
    xs = [lost[n - 1] for n in range(lo, hi + 1)]
    ys = [q_ch[lo - 1] / q_ch[n - 1] for n in range(lo, hi + 1)]
    return series_fn(xs, ys, 1.0)


def table(t, du=None, qr=None):
    """(ls, du, qr) with either replaced by a function of l."""
    ls, d0, q0 = t
    return ls, ([du(l) for l in ls] if du else d0), ([qr(l) for l in ls] if qr else q0)


def verdicts(S):
    st = list(S)
    lt = lambda a, b: a is not None and b is not None and a < b
    n212 = sum(lt(S[s]["absc_P"], S[s]["absc_O"]) for s in st)
    n213 = sum(lt(S[s]["e_P"], S[s]["e_O"]) for s in st)
    n214 = sum(lt(S[s]["absc_OQ"], S[s]["absc_O"]) for s in st)
    d = [abs(S[s]["absc_Of"] - S[s]["absc_O"]) if None not in (S[s]["absc_Of"], S[s]["absc_O"]) else float("inf")
         for s in st]
    ok215, bad215 = sum(x <= TOL215 for x in d), sum(x > BAD215 for x in d)
    v = PL.verdict
    return dict(H212=v(n212 >= 3, n212 <= 1), H213=v(n213 >= 3, n213 <= 1), H214=v(n214 >= 3, n214 <= 1),
                H215=v(ok215 == len(st), bad215 >= 2),
                counts=dict(n212=n212, n213=n213, n214=n214, ok215=ok215, bad215=bad215, d215=d))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    q_ch = WL.q_ch(r["current_A"], r["t_ch"])
    f = dict(lost_mol=r["lost_mol"], q_ch=q_ch)
    d = SK.design(b, f, f)
    eta = LD.eta_of(q_ch, r["lost_mol"], b, K)
    lost, lt = r["lost_mol"], d["l_true"]
    w = DP.weights(r["pl_node"][1])
    pts_l = [lost[n - 1] for n in range(2, TO)]
    Mw = WL.weighted_series(w, r["u_node"])               # n = 3..99
    Ew = WL.weighted_series(w, r["eta_pl_node"])
    du_o, du_p = OR.oracle_du(pts_l, [0.0] + Mw), OR.oracle_du(pts_l, [0.0] + Ew)
    qm = q_measured(lost, q_ch)
    tf = KP.tab(lost, b, eta, K, FINE)
    T = dict(O=table(d["t"], du_o), P=table(d["t"], du_p), OQ=table(d["t"], du_o, qm), PQ=table(d["t"], du_p, qm),
             Of=table(tf, du_o), Pf=table(tf, du_p))
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"],
               ratio99=Ew[-1] / Mw[-1] if Mw[-1] else None, E99=1e3 * Ew[-1], M99=1e3 * Mw[-1],
               E10=1e3 * Ew[K - 3], M10=1e3 * Mw[K - 3], qM99=qm(lost[TO - 2]))
    for v, t in T.items():
        out[f"e_{v}"] = PL.err(t, lost, lt, KAPPA)
        out[f"c_{v}"] = OR.curvature(t, lost)
    for k in LINES[1:]:
        out[f"e_P{k}"] = PL.err(T["P"], lost, lt, KAPPA, k=k)
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
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        d = dict(n=len(t))
        for v in VARS:
            d[f"e_{v}"] = med(r[f"e_{v}"] for r in t)
            d[f"c_{v}"] = med(r[f"c_{v}"] for r in t)
            d[f"absc_{v}"] = med(abs(r[f"c_{v}"]) if r[f"c_{v}"] is not None else None for r in t)
        for q in ("e_P30", "e_P50", "ratio99", "E10", "M10", "E99", "M99", "qM99"):
            d[q] = med(r[q] for r in t)
        d["winsP"] = sum(r["e_P"] is not None and r["e_O"] is not None and r["e_P"] < r["e_O"] for r in t)
        S[st] = d
    V = verdicts(S)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zp: the law fed the measured plating-overpotential rise (P) and/or the measured",
         "charge-capacity factor (Q), against 5zo's OCP oracle O; and O on a 10x finer table (f). 5zk's records, 40 designs,",
         "no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}" + "".join(f"{'e_' + v:>7s}" for v in VARS) + f"{'P<O':>7s}{'e_P30':>7s}{'e_P50':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d[f'e_{v}'], 7, 3) for v in VARS)
                 + f"{d['winsP']:>4d}/{d['n']:<2d}" + f(d["e_P30"], 7, 3) + f(d["e_P50"], 7, 3))
    L += ["", f"{'set':12s}" + "".join(f"{'|c_' + v + '|':>8s}" for v in VARS)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[f'absc_{v}'], 8, 3) for v in VARS))
    L += ["", f"{'set':12s}" + "".join(f"{'c_' + v:>8s}" for v in VARS)]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[f'c_{v}'], 8, 3) for v in VARS))
    L += ["", f"{'set':12s}{'M10':>8s}{'E10':>8s}{'M99':>8s}{'E99':>8s}{'E/M99':>8s}{'qM99':>8s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d[q], 8, 2) for q in ("M10", "E10", "M99", "E99", "ratio99"))
                 + f(d["qM99"], 8, 3))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10 unless suffixed; O = 5zo's OCP",
          " oracle, P = plating-overpotential oracle, Q = measured charge-capacity factor q_ch(2)/q_ch(n) in place of the",
          " law's Q_eta(0)/Q_eta(L), f = 600-cell table; P<O = designs where P beats O; c = ln(slope of R(L_n) on n over",
          " 50..99 / over 2..10); M, E = plating-weighted rise from cycle 2 of the end-of-charge node OCP and plating",
          " overpotential, mV, at cycles 10 and 99; qM99 = q_ch(2)/q_ch(99))", "",
          f"H212 (|c_P| below |c_O| on >= 3 of 4 sets): {V['H212']} ({c['n212']}/4)",
          f"H213 (e_P below e_O on >= 3 of 4 sets): {V['H213']} ({c['n213']}/4)",
          f"H214 (|c_OQ| below |c_O| on >= 3 of 4 sets): {V['H214']} ({c['n214']}/4)",
          f"H215 (fine grid moves |c_O| by <= 0.02 on all 4 sets): {V['H215']} ({c['ok215']} <= 0.02, "
          f"{c['bad215']} > 0.05; " + ", ".join(f"{x:.3f}" for x in c["d215"]) + ")"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
