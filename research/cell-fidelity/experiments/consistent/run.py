"""Milestone 5zd: does 5zc's loaded law forecast the 100-cycle lithium loss better when its potential lever is read at the
same eta-shortened charge window as its charge-time lever, instead of at the open-circuit upper cut-off?

    python experiments/consistent/run.py dev            # seen: 5zb's and 5zc's 256 designs, every form tried -> dev.txt
    python experiments/consistent/run.py tables         # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/consistent/run.py bench    # DFN (SEI + plating) to cycle 100 (5zc's simulate; resumable)
    python experiments/consistent/run.py report         # H157 to H161 (stdlib) -> results.txt, summary.json

5zc: the charge ends when the open-circuit voltage is eta short of the upper cut-off, so the charge time is
Q_eta(L)/I, and dL/dn = r0 (Q_eta(L)/Q_eta(0)) exp(-kappa dU(L)). 5zc still read dU at the open-circuit upper cut-off.
If the charge stops at OCV = vhi - eta, the negative electrode's open-circuit stoichiometry at the end of the charge is
the top of that shortened window, so the potential lever is read there too:
    dU_eta(L) = Un(x_hi(n_li - L; vhi - eta)) - Un(x_hi(n_li; vhi - eta)).
One eta, solved from the measured charge Ah of cycles 2..10 (5zc), sets both levers; nothing is fitted beyond 5zc's line
in n. Plan in ../../LOG.md (5zd plan).
"""
import importlib.util
import json
import math
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


LD = _mod("loaded_run", EXP / "loaded" / "run.py")
KN, SF, RL, D, FL, S, B = LD.KN, LD.SF, LD.RL, LD.D, LD.FL, LD.S, LD.B
K, TO, KAPPA = LD.K, LD.TO, LD.KAPPA
spearman, line_fit, log_err = LD.spearman, LD.line_fit, LD.log_err

WORKERS = int(os.environ.get("WORKERS", "3"))
SOBOL_SEED = 22        # used by no milestone (5zc used 21)
N_LOG2 = 5             # 32 designs per pool
NGRID = 60
# fixed before any run: one current per set that no milestone has used, inside each set's dev range
CONDITIONS = ("Ai2020@0.575x", "NCA_Kim2011@0.8125x", "Chen2020@1.3125x", "OKane2022@1.4375x")
CONTROLS, LGM50 = CONDITIONS[:2], CONDITIONS[2:]


# ---------- pure helpers (stdlib; tested) ----------

def x_hi(n_li, b, eta=0.0):
    """Negative stoichiometry where the open-circuit voltage reaches vhi - eta with n_li mol of cyclable lithium."""
    return B.window(n_li, dict(b, vhi=b["vhi"] - eta))[1]


def du_eta(l, b, eta):
    """Rise of the negative OCP at the top of the eta-shortened window after losing l mol; eta = 0 is 5x's open circuit."""
    un = lambda x: B.interp(b["g"], b["Un"], x)
    return un(x_hi(b["n_li"] - l, b, eta)) - un(x_hi(b["n_li"], b, eta))


def r_table(b, l_max, eta, du, kappa=KAPPA, n=NGRID):
    """(L, R) with R(L) = int_0^L exp(kappa du(l)) Q_eta(0)/Q_eta(l) dl (exponent clamped at +-50)."""
    ls = [l_max * i / n for i in range(n + 1)]
    q0 = LD.cap_eta(b["n_li"], b, eta)
    gs = []
    for l in ls:
        q = LD.cap_eta(b["n_li"] - l, b, eta)
        gs.append(math.exp(max(-50.0, min(50.0, kappa * du(l)))) * (q0 / q if q > 0 else 1e9))
    rs = [0.0]
    for i in range(1, n + 1):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def law_loss(lost, b, eta, du, k=K, to=TO):
    """L(to-1): a line through R at cycles 2..k, read at cycle to-1, inverted. None if R cannot be inverted."""
    if lost[k - 1] <= 0:
        return None
    tab = r_table(b, min(0.95 * b["n_li"], 30 * lost[k - 1]), eta, du)
    rk = [B.interp(tab[0], tab[1], lost[m - 1]) for m in range(2, k + 1)]
    a, s = line_fit(list(range(2, k + 1)), rk)
    try:
        return D.l_of_r(tab, a + s * (to - 1))
    except ZeroDivisionError:
        return None


def forms(b, lost, xs, u, eta, k=K):
    """Every potential-lever form tried on the seen designs (all disclosed in the plan): name -> du(l)."""
    un = lambda x: B.interp(b["g"], b["Un"], x)
    n, ns = b["n_li"], range(2, k + 1)
    d = SF.offset(xs, lost, b)
    de = statistics.mean(xs[m - 1] - x_hi(n - lost[m - 1], b, eta) for m in ns)
    x0e = x_hi(n, b, eta)
    _, s = line_fit([lost[m - 1] for m in ns], [u[m - 1] for m in ns])
    yo = [u[m - 1] - u[1] for m in ns]

    def through0(xv):
        sxx = sum(v * v for v in xv)
        return sum(p * q for p, q in zip(xv, yo)) / sxx if sxx > 0 else 1.0
    g = through0([du_eta(lost[m - 1], b, 0) - du_eta(lost[1], b, 0) for m in ns])
    ge = through0([du_eta(lost[m - 1], b, eta) - du_eta(lost[1], b, eta) for m in ns])
    return {"oc (5zc)": lambda l: du_eta(l, b, 0.0),
            "oc+offset": lambda l: SF.du_surf(l, b, d),
            "eta (5zd)": lambda l: du_eta(l, b, eta),
            "eta+offset": lambda l: un(x_hi(n - l, b, eta) + de) - un(x0e + de),
            "line in L": lambda l: s * l,
            "scaled oc": lambda l: g * du_eta(l, b, 0.0),
            "scaled eta": lambda l: ge * du_eta(l, b, eta)}


def row(b, f, q_ch, k=K):
    lost, u = f["lost_mol"], f["u_end"]
    eta = LD.eta_of(q_ch, lost, b, k)
    l_oc, l_eta = law_loss(lost, b, eta, lambda l: du_eta(l, b, 0.0)), law_loss(lost, b, eta, lambda l: du_eta(l, b, eta))
    true_rise = u[TO - 2] - u[1]
    return dict(l_true=lost[TO - 2], eta=eta, l_oc=l_oc, l_eta=l_eta, l_q=KN.kinetic_loss(lost, b),
                rise=true_rise,
                rise_err_oc=du_eta(lost[TO - 3], b, 0.0) - du_eta(lost[0], b, 0.0) - true_rise,
                rise_err_eta=du_eta(lost[TO - 3], b, eta) - du_eta(lost[0], b, eta) - true_rise)


def summarise(rows):
    ok = [r for r in rows if r["l_oc"] and r["l_eta"] and r["l_q"]]
    med = lambda k: statistics.median(abs(log_err(r[k], r["l_true"])) for r in ok)
    sgn = lambda k: statistics.median(log_err(r[k], r["l_true"]) for r in ok)
    return dict(n=len(ok), lerr_q=med("l_q"), lerr_oc=med("l_oc"), lerr_eta=med("l_eta"),
                sgn_q=sgn("l_q"), sgn_oc=sgn("l_oc"), sgn_eta=sgn("l_eta"),
                wins=sum(abs(log_err(r["l_eta"], r["l_true"])) < abs(log_err(r["l_oc"], r["l_true"])) for r in ok),
                rhoL_eta=spearman([r["l_eta"] for r in ok], [r["l_true"] for r in ok]),
                rise_mV=1000 * statistics.median(r["rise"] for r in ok),
                rise_err_oc_mV=1000 * statistics.median(abs(r["rise_err_oc"]) for r in ok),
                rise_err_eta_mV=1000 * statistics.median(abs(r["rise_err_eta"]) for r in ok),
                eta_mV=1000 * statistics.median(r["eta"] for r in ok))


def _b(bal, ocp, key):
    return dict(bal[key]) | dict(g=ocp["grid"]) | ocp["sets"][bal[key]["pset"]]


def _full(f):
    return f.get("ok") and f.get("ok_cycles", 0) >= TO


# ---------- dev (seen: 5zb's and 5zc's pools) ----------

def dev():
    pools = [("kinetic", {(r["cond"], r["j"]): r for r in B._load(EXP / "loaded" / "dev.jsonl")}), ("loaded", {})]
    res, names = {}, None
    for d, short in pools:
        bal, ocp = SF._bal(EXP / d)
        for f in B._load(EXP / d / "bench.jsonl"):
            s = short.get((f["cond"], f["j"]), f)
            if not _full(f) or len(s.get("q_ch", [])) < K:
                continue
            b, lost = _b(bal, ocp, (f["cond"], f["j"])), f["lost_mol"]
            eta = LD.eta_of(s["q_ch"], lost, b)
            F = forms(b, lost, f["xs_end"], f["u_end"], eta)
            names = list(F)
            for nm, du in F.items():
                le = law_loss(lost, b, eta, du)
                r = res.setdefault((f["cond"], nm), ([], []))
                r[0].append(abs(du(lost[TO - 3]) - du(lost[0]) - (f["u_end"][TO - 2] - f["u_end"][1])))
                r[1].append(abs(log_err(le, lost[TO - 2])) if le else float("inf"))
    L = ["cell-fidelity milestone 5zd dev (seen): 5zb's and 5zc's 256 designs, 5zc's eta (charge Ah of cycles 2 to 10) and",
         "line in n, every potential-lever form tried. Each cell: median |error| of the predicted cycle-99 separator-surface",
         "OCP rise u(99) - u(2) in mV / median |ln(L_pred(99) / L_DFN(99))|", "",
         f"{'condition':22s}" + "".join(f"{n:>14s}" for n in names)]
    for c in sorted({c for c, _ in res}):
        L.append(f"{c:22s}" + "".join(f"{1000 * statistics.median(res[(c, n)][0]):6.1f}/{statistics.median(res[(c, n)][1]):.3f}"
                                      .rjust(14) for n in names))
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


# ---------- fresh bench ----------

def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    LD.WORKERS = WORKERS
    path = HERE / "bench.jsonl"
    LD._run(LD._todo(path, B._load(HERE / "balance.jsonl")), path, TO)


def verdicts(C):
    ctl = [C[c] for c in CONTROLS if c in C]
    lg = [C[c] for c in LGM50 if c in C]
    allp = ctl + lg
    w = sum(c["lerr_eta"] < c["lerr_oc"] for c in lg)
    worse = [c["lerr_eta"] - c["lerr_oc"] for c in ctl]
    worst_eta, worst_oc = max(c["lerr_eta"] for c in allp), max(c["lerr_oc"] for c in allp)
    wr = sum(c["rise_err_eta_mV"] < c["rise_err_oc_mV"] for c in lg)
    return dict(H157=S.verdict(w == len(lg), w == 0), H157_wins=w,
                H158=S.verdict(all(c["lerr_eta"] <= 0.12 for c in lg), any(c["lerr_eta"] > 0.15 for c in lg)),
                H159=S.verdict(all(x <= 0.05 for x in worse), any(x > 0.10 for x in worse)),
                H160=S.verdict(worst_eta < worst_oc, worst_eta >= worst_oc), worst_eta=worst_eta, worst_oc=worst_oc,
                H161=S.verdict(wr == len(lg), wr == 0), H161_wins=wr)


def report():
    bal, ocp = SF._bal(HERE)
    rows, dropped = {}, {}
    for f in B._load(HERE / "bench.jsonl"):
        last = f   # readers keep the last record per design (memory kills are retried)
        rows.setdefault(f["cond"], {})[f["j"]] = last
    C, R = {}, {}
    for c in CONDITIONS:
        rs = []
        for j, f in sorted(rows.get(c, {}).items()):
            if not _full(f) or len(f.get("q_ch", [])) < K:
                dropped[c] = dropped.get(c, 0) + 1
                continue
            rs.append(row(_b(bal, ocp, (c, j)), f, f["q_ch"]) | dict(j=j))
        if rs:
            C[c], R[c] = summarise(rs) | dict(dropped=dropped.get(c, 0)), rs
    V = verdicts(C)
    L = ["cell-fidelity milestone 5zd: 5zc's loaded law with the potential lever read at the eta-shortened window (eta)",
         "against 5zc (open-circuit potential lever, oc) and 5zb (open-circuit Q and dU, q). DFN (SEI + plating) to cycle 100,",
         f"fresh Sobol designs (seed {SOBOL_SEED}); median |ln(L_pred(99) / L_DFN(99))|; rise: separator-surface OCP u(99) - u(2)", "",
         f"{'condition':22s}{'n':>3s}{'drop':>5s}{'5zb':>7s}{'5zc':>7s}{'5zd':>7s}{'sgn 5zc':>8s}{'sgn 5zd':>8s}{'wins':>5s}"
         f"{'rhoL':>7s}{'rise mV':>8s}{'err oc':>7s}{'err eta':>8s}{'eta mV':>7s}"]
    for c, d in C.items():
        L.append(f"{c:22s}{d['n']:3d}{d['dropped']:5d}{d['lerr_q']:7.3f}{d['lerr_oc']:7.3f}{d['lerr_eta']:7.3f}"
                 f"{d['sgn_oc']:+8.3f}{d['sgn_eta']:+8.3f}{d['wins']:5d}{d['rhoL_eta']:7.3f}{d['rise_mV']:8.1f}"
                 f"{d['rise_err_oc_mV']:7.1f}{d['rise_err_eta_mV']:8.1f}{d['eta_mV']:7.1f}")
    L += ["", f"H157 (eta lever beats 5zc on both LG M50 pools): {V['H157']} ({V['H157_wins']} of 2)",
          f"H158 (eta lever within 0.12 on both LG M50 pools): {V['H158']}",
          f"H159 (controls: no worse than 5zc by more than 0.05 on either): {V['H159']}",
          f"H160 (worst-pool error below 5zc's; {V['worst_eta']:.3f} vs {V['worst_oc']:.3f}): {V['H160']}",
          f"H161 (eta window forecasts the cycle-99 surface OCP rise better than open circuit on both LG M50 pools): "
          f"{V['H161']} ({V['H161_wins']} of 2)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=R), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
