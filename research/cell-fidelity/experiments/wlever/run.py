"""Milestone 5zl: per design, on the same designs, is the plating exponent the ten-cycle forecast needs (5zf's oracle
kappa*) 25.3 times the ratio of the plating-weighted measured OCP rise to the law's own lever rise?

    python experiments/wlever/run.py rows      # per design: eta, D_n, M_sep, M_w, rho, kappa*, errors (stdlib; ~1 min)
    python experiments/wlever/run.py report    # H195 to H199 -> results.txt, summary.json

5zi compared the law's lever dU_eta(L_n) with the separator-node OCP rise on the 768 designs of 5zb to 5zg; 5zk recorded
the OCP and the plating at every negative-electrode node on 5z's 40 designs (another pool) and compared set medians
across pools. This step needs no new simulation: 5zk's records carry everything the law needs (lost lithium per cycle,
and the constant-current charge time, so the charge Ah is I t_ch / 3600), so kappa*, the law's lever and both measured
levers are computed on the same 40 designs.

Per design (5zk's `experiments/depth/bench.jsonl`; the balance from `crossset` or `calmap`, the pool 5z drew it from):
    eta  = 5zd's effective overpotential from cycles 2..10 (LD.eta_of), dU_eta = 5zc's lever (CN.du_eta), unchanged
    D_n  = dU_eta(L_n) - dU_eta(L_2)
    Ms_n = u_sep(n) - u_sep(2)                         the separator-node OCP rise at end of charge (5zi's M_n)
    Mw_n = sum_i w_i(2) (u_i(n) - u_i(2))             the rise where the cycle-2 plating was (5zk's M_w, every n)
    rho_x = least-squares slope through the origin of M_x on D over n = 3..99; kappa_x = 25.3 rho_x in [0, 100]
    kappa* = 5zf's oracle (KP.kappa_oracle via SK.design), unchanged
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


LV = _mod("lever_run", EXP / "lever" / "run.py")
DP = _mod("depth_run", EXP / "depth" / "run.py")
SK, CN, LD, SF, B = LV.SK, LV.CN, LV.LD, LV.SF, LV.B
K, TO, KAPPA, KMAX = LV.K, LV.TO, LV.KAPPA, LV.KMAX
spearman, ratio, clamp = SK.spearman, LV.ratio, LV.clamp
SETS = DP.SETS                      # set -> 5z's condition
SRC = {"Ai2020@0.45x": "calmap"}    # every other condition came from crossset (mechanism/run.py POOLS)
# 5zi's set medians over its 24 pools (experiments/lever/summary.json, as 5zk fixed them)
K_PATH, K_STAR = DP.K_PATH, DP.K_STAR
TOL = 0.25


# ---------- pure helpers (stdlib; tested) ----------

def q_ch(current_a, t_ch):
    """Constant-current charge Ah per cycle (the experiment charges at constant current to the cut-off, no hold)."""
    return [current_a * t / 3600.0 for t in t_ch]


def weighted_series(w, U, lo=2, hi=TO - 1):
    """Mw_n for n = lo+1..hi with fixed weights w (1-based cycles; U[n-1] is cycle n's node OCPs)."""
    a = U[lo - 1]
    return [sum(wi * (b - c) for wi, b, c in zip(w, U[n - 1], a)) for n in range(lo + 1, hi + 1)]


def sep_series(U, lo=2, hi=TO - 1):
    return [U[n - 1][-1] - U[lo - 1][-1] for n in range(lo + 1, hi + 1)]


def law_series(du, lost, lo=2, hi=TO - 1):
    return [du(lost[n - 1]) - du(lost[lo - 1]) for n in range(lo + 1, hi + 1)]


def logmiss(k, ks):
    return abs(math.log(k / ks)) if k and ks and k > 0 and ks > 0 else None


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def within(a, b, tol):
    return b > 0 and abs(a / b - 1.0) <= tol


def verdicts(S):
    """S: per set medians. Thresholds fixed in the plan (LOG.md, 5zl)."""
    st = list(S)
    h195 = verdict(all(within(S[s]["k_sep"], K_PATH[s], TOL) for s in st),
                   any(not within(S[s]["k_sep"], K_PATH[s], 0.5) for s in st))
    h196 = verdict(all(within(S[s]["k_star"], K_STAR[s], TOL) for s in st),
                   any(not within(S[s]["k_star"], K_STAR[s], 0.5) for s in st))
    n197 = sum(S[s]["miss_w"] < S[s]["miss_sep"] for s in st)
    ai_hit = "Ai2020" in S and within(S["Ai2020"]["k_w"], S["Ai2020"]["k_star"], TOL)
    h197 = verdict(n197 >= 3 and ai_hit, n197 <= 1)
    n198_ok = sum(S[s]["sp_w"] is not None and S[s]["sp_w"] >= 0.4 for s in st)
    n198_bad = sum(S[s]["sp_w"] is None or S[s]["sp_w"] < 0.15 for s in st)
    h198 = verdict(n198_ok >= 3, n198_bad >= 3)
    n199 = sum(S[s]["err_w"] is not None and S[s]["err_w"] < S[s]["err_phys"] for s in st)
    h199 = verdict(n199 >= 3, n199 <= 1)
    return dict(H195=h195, H196=h196, H197=h197, H198=h198, H199=h199,
                counts=dict(n197=n197, ai_hit=ai_hit, n198_ok=n198_ok, n198_bad=n198_bad, n199=n199))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    f = dict(lost_mol=r["lost_mol"], q_ch=q_ch(r["current_A"], r["t_ch"]))
    d = SK.design(b, f, f)
    eta = LD.eta_of(f["q_ch"], f["lost_mol"], b, K)
    du = lambda l: CN.du_eta(l, b, eta)
    U = r["u_node"]
    w2 = DP.weights(r["pl_node"][1])
    D = law_series(du, r["lost_mol"])
    Ms, Mw = sep_series(U), weighted_series(w2, U)
    rs, rw = ratio(Ms, D), ratio(Mw, D)
    ks = None if rs is None else clamp(KAPPA * rs)
    kw = None if rw is None else clamp(KAPPA * rw)
    return dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], eta=eta, k_star=d["k_star"], rho_sep=rs, rho_w=rw,
                k_sep=ks, k_w=kw, rho_need=d["k_star"] / KAPPA, d99_mV=1e3 * D[-1], ms99_mV=1e3 * Ms[-1],
                mw99_mV=1e3 * Mw[-1], miss_sep=logmiss(ks, d["k_star"]), miss_w=logmiss(kw, d["k_star"]),
                err_phys=SK.err_at(d, KAPPA), err_sep=None if ks is None else SK.err_at(d, ks),
                err_w=None if kw is None else SK.err_at(d, kw), err_star=SK.err_at(d, d["k_star"]))


def rows():
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {d: SF._bal(EXP / d) for d in ("crossset", "calmap")}
    out = [_row(r, *bals[SRC.get(r["cond"], "crossset")]) for r in runs]
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


def _med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        both = [r for r in t if r["k_w"] is not None]
        S[st] = dict(n=len(t), **{k: _med(r[k] for r in t) for k in
                                  ("eta", "k_star", "k_sep", "k_w", "rho_need", "rho_sep", "rho_w", "d99_mV", "ms99_mV",
                                   "mw99_mV", "miss_sep", "miss_w", "err_phys", "err_sep", "err_w", "err_star")},
                     sp_w=spearman([r["k_w"] for r in both], [r["k_star"] for r in both]) if len(both) > 2 else None,
                     sp_sep=spearman([r["k_sep"] for r in both], [r["k_star"] for r in both]) if len(both) > 2 else None,
                     none_w=len(t) - len(both))
    V = verdicts(S)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zl: per design on 5z's 40 designs (5zk's x-resolved records), the oracle kappa* against",
         "25.3 x (measured OCP rise) / (the law's lever rise), read at the separator node (sep) and where the cycle-2",
         "plating was (w). No new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}{'k*':>6s}{'k_sep':>7s}{'k_w':>6s}{'d99':>6s}{'ms99':>6s}{'mw99':>6s}{'need':>6s}"
         f"{'r_sep':>6s}{'r_w':>6s}{'miss_s':>7s}{'miss_w':>7s}{'sp_s':>6s}{'sp_w':>6s}"
         f"{'e_phys':>7s}{'e_sep':>7s}{'e_w':>7s}{'e_k*':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}{f(d['k_star'], 6, 1)}{f(d['k_sep'], 7, 1)}{f(d['k_w'], 6, 1)}{f(d['d99_mV'], 6, 1)}"
                 f"{f(d['ms99_mV'], 6, 1)}{f(d['mw99_mV'], 6, 1)}{f(d['rho_need'], 6, 2)}{f(d['rho_sep'], 6, 2)}"
                 f"{f(d['rho_w'], 6, 2)}{f(d['miss_sep'], 7, 3)}{f(d['miss_w'], 7, 3)}{f(d['sp_sep'], 6, 2)}"
                 f"{f(d['sp_w'], 6, 2)}{f(d['err_phys'], 7, 3)}{f(d['err_sep'], 7, 3)}{f(d['err_w'], 7, 3)}"
                 f"{f(d['err_star'], 7, 3)}")
    L += ["", "(d99, ms99, mw99: law lever, separator-node and plating-weighted OCP rise from cycle 2 to 99, mV;",
          " need = k*/25.3, the lever ratio the forecast needs; r_sep, r_w: the measured ratios; miss = |ln(k/k*)|;",
          " sp = within-set Spearman(k, k*); e = |ln(L_pred(99)/L_DFN(99))| at 25.3, k_sep, k_w and the oracle k*)", ""]
    c = V["counts"]
    L += [f"H195 (set median k_sep within 25% of 5zi's set k_path on all four sets): {V['H195']}",
          f"H196 (set median k* within 25% of 5zi's set k* on all four sets): {V['H196']}",
          f"H197 (|ln(k_w/k*)| below |ln(k_sep/k*)| on >= 3 of 4 sets, k_w within 25% of k* on Ai2020): {V['H197']}"
          f" ({c['n197']}/4, Ai2020 {'hit' if c['ai_hit'] else 'miss'})",
          f"H198 (within-set Spearman(k_w, k*) >= 0.4 on >= 3 of 4 sets): {V['H198']} ({c['n198_ok']} >= 0.4,"
          f" {c['n198_bad']} < 0.15)",
          f"H199 (the forecast at k_w beats 25.3 on >= 3 of 4 sets): {V['H199']} ({c['n199']}/4)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
