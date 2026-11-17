"""Milestone 5zm: how many cycles does the plating-weighted lever need before it sets the plating exponent?

    python experiments/horizon10/run.py rows      # per design and budget k: kappa_w,k and forecast errors (stdlib)
    python experiments/horizon10/run.py report    # H200 to H203 -> results.txt, summary.json

5zl read kappa_w = 25.3 x slope(M_w on D) over cycles 3..99, a diagnosis. Here the slope is cut at a budget of k cycles,
k in (10, 20, 30, 50), and each forecast of L(99) gets the same k cycles:
    A_k = the law at 25.3, its line fitted through cycles 2..k       (5zf's KP.forecast with k)
    B_k = the law at kappa_w,k, its line fitted through cycles 2..k
    C_k = the law at kappa_w,k, its line through cycles 2..10 only   (reported, not hypothesised)
kappa_w,k falls back to 25.3 when D carries no signal (ratio None). Everything else is 5zl's (wlever `_row` inputs).
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


WL = _mod("wlever_run", EXP / "wlever" / "run.py")
KP = WL.LV.SK.KP
SK, CN, LD, DP, B = WL.SK, WL.CN, WL.LD, WL.DP, WL.B
K, TO, KAPPA = WL.K, WL.TO, WL.KAPPA
SETS = WL.SETS
BUDGETS = (10, 20, 30, 50)
TOL_SETTLE, BAD_SETTLE = 0.15, 0.30


# ---------- pure helpers (stdlib; tested) ----------

def cut(series, k):
    """Series indexed n = 3..99 -> the part n = 3..k."""
    return series[: max(0, k - 2)]


def kappa_at(mw, d, k):
    """(kappa_w,k, fell_back): 25.3 x slope through the origin over n = 3..k, clamped; 25.3 if D has no signal."""
    r = WL.ratio(cut(mw, k), cut(d, k))
    return (KAPPA, True) if r is None else (WL.clamp(KAPPA * r), False)


def err(design, kappa, k):
    p = KP.forecast(design["t"], design["lost"], kappa, k=k)
    return abs(math.log(p / design["l_true"])) if p and p > 0 else None


def lmiss(a, b):
    return abs(math.log(a / b)) if a and b and a > 0 and b > 0 else None


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def verdicts(S):
    """S[set][k] = medians. Thresholds fixed in the plan (LOG.md, 5zm)."""
    st = list(S)
    beat = lambda k: sum(S[s][k]["eB"] is not None and S[s][k]["eB"] < S[s][k]["eA"] for s in st)
    n200, n202 = beat(10), beat(30)
    set_ok = sum(S[s][30]["settle"] is not None and S[s][30]["settle"] <= TOL_SETTLE for s in st)
    set_bad = sum(S[s][30]["settle"] is None or S[s][30]["settle"] > BAD_SETTLE for s in st)
    sp_ok = sum(S[s][30]["sp"] is not None and S[s][30]["sp"] >= 0.4 for s in st)
    sp_bad = sum(S[s][30]["sp"] is None or S[s][30]["sp"] < 0.15 for s in st)
    return dict(H200=verdict(n200 >= 3, n200 <= 1), H201=verdict(set_ok >= 3, set_bad >= 3),
                H202=verdict(n202 >= 3, n202 <= 1), H203=verdict(sp_ok >= 3, sp_bad >= 3),
                counts=dict(n200=n200, set_ok=set_ok, set_bad=set_bad, n202=n202, sp_ok=sp_ok, sp_bad=sp_bad))


# ---------- rows ----------

def _row(r, bal, ocp):
    b = CN._b(bal, ocp, (r["cond"], r["j"]))
    f = dict(lost_mol=r["lost_mol"], q_ch=WL.q_ch(r["current_A"], r["t_ch"]))
    d = SK.design(b, f, f)
    eta = LD.eta_of(f["q_ch"], f["lost_mol"], b, K)
    du = lambda l: CN.du_eta(l, b, eta)
    U = r["u_node"]
    D = WL.law_series(du, r["lost_mol"])
    Mw = WL.weighted_series(DP.weights(r["pl_node"][1]), U)
    k99, _ = kappa_at(Mw, D, TO - 1)
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], k_star=d["k_star"], k_w99=k99, by={},
               k_pt99=KAPPA * Mw[-1] / D[-1] if D[-1] > 1e-9 else None)
    for k in BUDGETS:
        kk, fb = kappa_at(Mw, D, k)
        out["by"][str(k)] = dict(k_w=kk, fallback=fb, d_mV=1e3 * D[k - 3], mw_mV=1e3 * Mw[k - 3],
                                 eA=err(d, KAPPA, k), eB=err(d, kk, k), eC=err(d, kk, K),
                                 settle=lmiss(kk, k99), miss=lmiss(kk, d["k_star"]))
    return out


def rows():
    runs = [r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    out = [_row(r, *bals[WL.SRC.get(r["cond"], "crossset")]) for r in runs]
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
        S[st] = {}
        for k in BUDGETS:
            b = [r["by"][str(k)] for r in t]
            S[st][k] = dict(n=len(t), **{q: _med(x[q] for x in b) for q in
                                         ("k_w", "d_mV", "mw_mV", "eA", "eB", "eC", "settle", "miss")},
                            k_star=_med(r["k_star"] for r in t), k_w99=_med(r["k_w99"] for r in t),
                            fallback=sum(x["fallback"] for x in b),
                            sp=SK.spearman([x["k_w"] for x in b], [r["k_star"] for r in t]) if len(t) > 2 else None)
    V = verdicts(S)
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    L = ["cell-fidelity milestone 5zm: the plating-weighted lever cut at a budget of k cycles (5zk's records, 5z's 40",
         "designs, no new simulation). Set medians. A = 25.3, line through 2..k; B = kappa_w,k, line through 2..k;",
         "C = kappa_w,k, line through 2..10.", "",
         f"{'set':12s}{'k':>3s}{'n':>3s}{'k*':>6s}{'k_w99':>6s}{'k_w,k':>6s}{'fb':>3s}{'d_k':>6s}{'mw_k':>6s}"
         f"{'settle':>7s}{'miss':>6s}{'sp':>6s}{'e_A':>7s}{'e_B':>7s}{'e_C':>7s}"]
    for st, by in S.items():
        for k, d in by.items():
            L.append(f"{st:12s}{k:3d}{d['n']:3d}{f(d['k_star'], 6, 1)}{f(d['k_w99'], 6, 1)}{f(d['k_w'], 6, 1)}"
                     f"{d['fallback']:3d}{f(d['d_mV'], 6, 2)}{f(d['mw_mV'], 6, 2)}{f(d['settle'], 7, 3)}"
                     f"{f(d['miss'], 6, 3)}{f(d['sp'], 6, 2)}{f(d['eA'], 7, 3)}{f(d['eB'], 7, 3)}{f(d['eC'], 7, 3)}")
    L += ["", "(fb = designs whose kappa fell back to 25.3; d_k, mw_k = the law's and the plating-weighted rise from",
          " cycle 2 to k, mV; settle = |ln(k_w,k / k_w,99)|; miss = |ln(k_w,k / k*)|; sp = within-set",
          " Spearman(k_w,k, k*); e = |ln(L_pred(99)/L_DFN(99))|)", ""]
    c = V["counts"]
    L += [f"H200 (k = 10: B below A on >= 3 of 4 sets): {V['H200']} ({c['n200']}/4)",
          f"H201 (k = 30: |ln(k_w,30/k_w,99)| <= 0.15 on >= 3 of 4 sets): {V['H201']} ({c['set_ok']} <= 0.15,"
          f" {c['set_bad']} > 0.3)",
          f"H202 (k = 30: B below A on >= 3 of 4 sets): {V['H202']} ({c['n202']}/4)",
          f"H203 (k = 30: Spearman(k_w,30, k*) >= 0.4 on >= 3 of 4 sets): {V['H203']} ({c['sp_ok']} >= 0.4,"
          f" {c['sp_bad']} < 0.15)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets={s: {str(k): v for k, v in by.items()} for s, by in S.items()},
                                                       verdicts=V), indent=1) + "\n")
    print("\n".join(L))


def posthoc():
    """After the verdicts: the pointwise lever ratio Mw_k / D_k (cycle 2 to k) per design, set medians, and the
    forecasts' design-level win counts at each budget."""
    rs = json.loads((HERE / "rows.json").read_text())
    ks = list(BUDGETS) + [TO - 1]
    L = ["5zm post hoc (after the verdicts): set median of the pointwise ratio (plating-weighted rise) / (law's rise)",
         "from cycle 2 to k, times 25.3 (what kappa would be if the ratio were constant); and designs where B beats A", "",
         f"{'set':12s}" + "".join(f"{'k=' + str(k):>8s}" for k in ks) + "".join(f"{'B<A@' + str(k):>8s}" for k in BUDGETS)]
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        pt = []
        for k in ks:
            v = [KAPPA * r["by"][str(k)]["mw_mV"] / r["by"][str(k)]["d_mV"] for r in t
                 if str(k) in r["by"] and r["by"][str(k)]["d_mV"] > 1e-6] if k in BUDGETS else None
            pt.append(_med(v) if v is not None else _med(r["k_pt99"] for r in t))
        wins = [sum(r["by"][str(k)]["eB"] < r["by"][str(k)]["eA"] for r in t) for k in BUDGETS]
        L.append(f"{st:12s}" + "".join(f"{x:8.1f}" for x in pt) + "".join(f"{w:>5d}/{len(t):<2d}" for w in wins))
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
