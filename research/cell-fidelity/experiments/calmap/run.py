"""Milestone 5v: is the balance map's ranking failure a conditioning problem, and does one self-limiting correction of
the ten-cycle lithium law, fitted on 5u's three Ai2020 pools and frozen, carry to fresh Ai2020 pools?

    python experiments/calmap/run.py dev       # the dev numbers in the 5v plan, from 5u's committed pools (stdlib)
    python experiments/calmap/run.py tables    # balance tables and stack mass of the fresh designs (pybamm, no simulation)
    WORKERS=2 python experiments/calmap/run.py bench   # DFN (SEI + plating) to cycle 100 with the lithium curve (resumable)
    python experiments/calmap/run.py report    # H122 to H125 (stdlib) -> results.txt, summary.json

5u found the map fed DFN's own cycle-99 lithium loss ranks the 100-cycle energy at 0.95 to 0.97 while the map fed the
per-design ten-cycle law ranks at 0.64 to 0.76. On 5u's pools (dev, seen) the law already ranks the cycle-99 lithium
loss itself at 0.98 to 0.99 Spearman, so the order is not what is missing: the map is steep, and a 10% random error on
the true loss alone drops its energy ranking to 0.38 to 0.67. The law's error is not random, though: L_law / L_DFN rises
with the predicted fraction of lithium lost (Spearman 0.82 to 0.93 on the Ai2020 pools), the signature of a loss that
slows as the cell loses more. One line, log(L_law / L_DFN) = A + S log(L_law / n_Li), fitted pooled on 5u's Ai2020
pools, gives A = 0.658, S = 0.577 (per-pool slopes 0.57, 0.60, 0.59). Those two numbers are frozen here and the
corrected loss L_law / exp(A + S log(L_law / n_Li)) goes through 5s's map unchanged. Plan in ../../LOG.md (5v plan),
written before any fresh run.
"""
import importlib.util
import json
import math
import os
import random
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


FL = _mod("freshlaw_run", EXP / "freshlaw" / "run.py")
S, B = FL.S, FL.B
K, TO, M = S.K, S.TO, S.M
spearman, ocv_energy, sign_p = B.spearman, B.ocv_energy, FL.sign_p

SOBOL_SEED = 15        # used by no milestone (5u used 14)
# fixed before any run: Ai2020 (the set the constants were fitted on) at one current 5s ran (0.35x, new designs) and two no milestone ran
CONDITIONS = ("Ai2020@0.35x", "Ai2020@0.45x", "Ai2020@0.6x")
A_FROZEN, S_FROZEN = 0.658, 0.577   # pooled fit on 5u's three Ai2020 pools (dev); checked by `dev`
N_CAL = 8              # descriptive self-calibration: designs per pool run to 100 cycles to refit A, S
NOISE = 0.10           # lognormal sigma on the true loss for the conditioning check
NOISE_REPS = 20


# ---------- pure helpers (stdlib; tested) ----------

def corrected(l_law, n_li, a=A_FROZEN, s=S_FROZEN):
    """The law's cycle-99 loss corrected for self-limiting: L_law / exp(a + s log(L_law / n_Li))."""
    if not l_law or l_law <= 0 or n_li <= 0:
        return l_law
    return l_law / math.exp(a + s * math.log(l_law / n_li))


def fit_correction(pairs):
    """(a, s) of log(L_law / L_true) = a + s log(L_law / n_Li), least squares over (l_law, l_true, n_li) triples."""
    pts = [(math.log(lw / n), math.log(lw / lt)) for lw, lt, n in pairs if lw and lw > 0 and lt > 0 and n > 0]
    return S.lsq([x for x, _ in pts], [y for _, y in pts])


def map_energy(bal, lost, wh10, l99, k=K):
    """5s's map: wh10 x E_ocv(n_Li - L(99)) / E_ocv(n_Li - lost by end of cycle k-1), L floored at that loss."""
    l_k = lost[k - 2]
    e_k, _ = ocv_energy(bal["n_li"] - l_k, bal)
    e_to, _ = ocv_energy(bal["n_li"] - max(l99, l_k), bal)
    return wh10 * e_to / e_k if e_k > 0 else 0.0


def log_err(pred, true):
    return abs(math.log(pred / true)) if pred and pred > 0 and true > 0 else None


# ---------- rows from a bench ----------

def rows_of(c, runs, bal, ocp):
    good = [(j, f) for (cc, j), f in sorted(runs.items()) if cc == c and f["ok"] and len(f.get("cycle_wh", [])) >= TO
            and f["cycle_wh"][0] > 0]
    b_med = FL.pool_exponent([f["lost_mol"] for _, f in good])
    law = FL.choose_law(b_med)
    out = []
    for j, f in good:
        bl = bal[(c, j)]
        b = dict(bl) | dict(g=ocp["grid"]) | ocp["sets"][bl["pset"]]
        m, wh, lost = bl["mass_kg"], f["cycle_wh"], f["lost_mol"]
        l_law = FL.law_l(lost, law, TO - 1)
        out.append(dict(j=j, b=b, m=m, lost=lost, wh10=wh[K - 1], score=wh[TO - 1] / m, raw10=wh[K - 1] / m,
                        sqrt=S.sqrt_extrapolate([w / m for w in wh]), l_law=l_law, l_true=lost[TO - 2], n_li=b["n_li"]))
    return out, b_med, law, sum(cc == c for cc, _ in runs) - len(good)


def evaluate(rows, a, s, cal=None):
    """Per-pool metrics; `cal` = (a, s) refitted on N_CAL designs for the descriptive self-calibrated map."""
    sc = [r["score"] for r in rows]
    for r in rows:
        r["l_corr"] = corrected(r["l_law"], r["n_li"], a, s)
        r["law"] = map_energy(r["b"], r["lost"], r["wh10"], r["l_law"] or 0) / r["m"]
        r["corr"] = map_energy(r["b"], r["lost"], r["wh10"], r["l_corr"] or 0) / r["m"]
        r["true_map"] = map_energy(r["b"], r["lost"], r["wh10"], r["l_true"]) / r["m"]
        if cal:
            r["selfcal"] = map_energy(r["b"], r["lost"], r["wh10"], corrected(r["l_law"], r["n_li"], *cal) or 0) / r["m"]
    noisy = []
    for t in range(NOISE_REPS):
        rnd = random.Random(t)
        noisy.append(spearman([map_energy(r["b"], r["lost"], r["wh10"], r["l_true"] * math.exp(rnd.gauss(0, NOISE))) / r["m"]
                               for r in rows], sc))
    rho = lambda k: spearman([r[k] for r in rows], sc)
    raw, sq, co = FL.top(rows, "raw10"), FL.top(rows, "sqrt"), FL.top(rows, "corr")
    lt = [r["l_true"] for r in rows]
    d = dict(n=len(rows), rho_raw=rho("raw10"), rho_sqrt=rho("sqrt"), rho_law=rho("law"), rho_corr=rho("corr"),
             rho_true_map=rho("true_map"), rho_noisy=statistics.mean(noisy),
             rhoL_law=spearman([r["l_law"] or 0 for r in rows], lt), rhoL_corr=spearman([r["l_corr"] or 0 for r in rows], lt),
             lerr_law=statistics.median(e for e in (log_err(r["l_law"], r["l_true"]) for r in rows) if e is not None),
             lerr_corr=statistics.median(e for e in (log_err(r["l_corr"], r["l_true"]) for r in rows) if e is not None),
             ratio_frac=spearman([(r["l_law"] or 0) / r["l_true"] for r in rows], [r["l_true"] / r["n_li"] for r in rows]),
             gap_5n=FL.gap_of(rows, raw | sq), n_5n=len(raw | sq), gap_corr=FL.gap_of(rows, raw | co), n_corr=len(raw | co),
             fade_dfn_median=statistics.median(1 - r["score"] / r["raw10"] for r in rows))
    if cal:
        d |= dict(cal_a=cal[0], cal_s=cal[1], rho_selfcal=rho("selfcal"),
                  gap_selfcal=FL.gap_of(rows, raw | FL.top(rows, "selfcal")))
    return d


def selfcal(rows, n=N_CAL, seed=0):
    """(a, s) refitted on n designs drawn at random (fixed seed) from the pool: the cost a user would pay to calibrate."""
    pick = random.Random(seed).sample(range(len(rows)), min(n, len(rows)))
    return fit_correction([(rows[i]["l_law"], rows[i]["l_true"], rows[i]["n_li"]) for i in pick])


def verdicts(C):
    T = list(C.values())
    n = len(T)
    w122 = sum(c["rho_corr"] > c["rho_sqrt"] for c in T)
    return dict(n=n,
                H122=S.verdict(w122 == n and all(c["rho_corr"] >= 0.85 for c in T),
                               w122 <= n - 2 or any(c["rho_corr"] < 0.75 for c in T)),
                H122_wins=w122, p122=sign_p(w122, n), H122_rhos=[c["rho_corr"] for c in T],
                H123=S.verdict(all(c["lerr_corr"] <= 0.06 for c in T), any(c["lerr_corr"] > 0.10 for c in T)),
                H123_errs=[c["lerr_corr"] for c in T],
                H124=S.verdict(all(c["gap_corr"] <= 0.005 and c["gap_corr"] - c["gap_5n"] <= 0.005 for c in T),
                               any(c["gap_corr"] > 0.02 for c in T)),
                H124_worst=max(c["gap_corr"] for c in T), H124_excess=max(c["gap_corr"] - c["gap_5n"] for c in T),
                H125=S.verdict(all(c["rho_true_map"] - c["rho_noisy"] >= 0.2 for c in T),
                               any(c["rho_true_map"] - c["rho_noisy"] < 0.1 for c in T)),
                H125_drops=[c["rho_true_map"] - c["rho_noisy"] for c in T])


# ---------- commands ----------

def _load(d):
    runs = {(r["cond"], r["j"]): r for r in B._load(d / "bench.jsonl")}
    bal = {(r["cond"], r["j"]): r for r in B._load(d / "balance.jsonl")}
    return runs, bal, json.loads((d / "ocp.json").read_text())


def dev():
    d = EXP / "freshlaw"
    runs, bal, ocp = _load(d)
    R = {c: rows_of(c, runs, bal, ocp) for c in FL.CONDITIONS}
    a, s = fit_correction([(r["l_law"], r["l_true"], r["n_li"]) for c, (rows, *_) in R.items() if c.startswith("Ai2020")
                           for r in rows])
    print(f"pooled fit on 5u's Ai2020 pools: A = {a:.3f}, S = {s:.3f} (frozen: {A_FROZEN}, {S_FROZEN})")
    for c, (rows, b_med, law, _) in R.items():
        ap, sp = fit_correction([(r["l_law"], r["l_true"], r["n_li"]) for r in rows])
        e = evaluate(rows, a, s)
        print(f"{c:20s} law {law:5s} slope {sp:.2f}  rhoL law {e['rhoL_law']:.3f}  ratio~frac {e['ratio_frac']:+.2f}  "
              f"rhoE law {e['rho_law']:.3f} corr {e['rho_corr']:.3f} trueL {e['rho_true_map']:.3f} noisy10% {e['rho_noisy']:.3f} "
              f"sqrtE {e['rho_sqrt']:.3f}  |log err| {e['lerr_law']:.3f} -> {e['lerr_corr']:.3f}")


def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS = HERE, SOBOL_SEED, CONDITIONS
    FL.tables()


def bench():
    FL.HERE = HERE
    FL.bench()


def report():
    runs, bal, ocp = _load(HERE)
    C, Rows = {}, {}
    for c in CONDITIONS:
        rows, b_med, law, dropped = rows_of(c, runs, bal, ocp)
        if len(rows) < 8:
            continue
        C[c] = evaluate(rows, A_FROZEN, S_FROZEN, cal=selfcal(rows)) | dict(b_med=b_med, law_name=law, dropped=dropped)
        Rows[c] = [{k: v for k, v in r.items() if k not in ("b", "lost")} for r in rows]
    V = verdicts(C)
    L = [f"cell-fidelity milestone 5v: 5s's map fed the ten-cycle lithium law corrected for self-limiting loss,",
         f"L_corr = L_law / exp({A_FROZEN} + {S_FROZEN} log(L_law / n_Li)), constants frozen from 5u's Ai2020 pools;",
         f"fresh pools: 64 Sobol designs (seed {SOBOL_SEED}) x {len(CONDITIONS)} conditions, DFN (SEI + plating) to cycle 100", "",
         f"{'condition':16s}{'n':>4s}{'drop':>5s}{'b_med':>6s}{'law':>6s}{'rhoE raw':>9s}{'sqrtE':>7s}{'law':>7s}{'corr':>7s}"
         f"{'trueL':>7s}{'noisy':>7s}{'self':>7s}{'rhoL law':>9s}{'corr':>7s}{'|lnerr| law':>12s}{'corr':>7s}"
         f"{'gap 5n':>8s}{'corr':>7s}{'self':>7s}{'fade':>6s}"]
    for c, d in C.items():
        L.append(f"{c:16s}{d['n']:4d}{d['dropped']:5d}{d['b_med']:6.2f}{d['law_name']:>6s}{d['rho_raw']:9.3f}{d['rho_sqrt']:7.3f}"
                 f"{d['rho_law']:7.3f}{d['rho_corr']:7.3f}{d['rho_true_map']:7.3f}{d['rho_noisy']:7.3f}{d['rho_selfcal']:7.3f}"
                 f"{d['rhoL_law']:9.3f}{d['rhoL_corr']:7.3f}{d['lerr_law']:12.3f}{d['lerr_corr']:7.3f}"
                 f"{d['gap_5n']:8.4f}{d['gap_corr']:7.4f}{d['gap_selfcal']:7.4f}{d['fade_dfn_median']:6.3f}")
    n = V["n"]
    L += ["", f"H122 (corrected map ranks DFN@100 above 5n's sqrt energy fit on all {n} and at >= 0.85 on each): {V['H122']}"
              f" ({V['H122_wins']} of {n}; rho {', '.join(f'{x:.3f}' for x in V['H122_rhos'])})",
          f"H123 (median |ln(L_corr / L_DFN)| at cycle 99 <= 0.06 on every pool): {V['H123']} ({', '.join(f'{x:.3f}' for x in V['H123_errs'])})",
          f"H124 (union raw top 4 + corrected top 4 within 0.5% of the DFN best and within 0.5 points of 5n's union on every pool): "
          f"{V['H124']} (worst gap {V['H124_worst']:.4f}, worst excess over 5n {V['H124_excess']:+.4f})",
          f"H125 (a {NOISE:.0%} lognormal error on the true loss drops the map's rank by >= 0.2 on every pool): {V['H125']}"
          f" (drops {', '.join(f'{x:.3f}' for x in V['H125_drops'])})", "",
          f"Descriptive: 'self' refits A, S on {N_CAL} random designs of the same pool run to cycle 100 "
          + "; ".join(f"{c} A = {d['cal_a']:.3f}, S = {d['cal_s']:.3f}" for c, d in C.items()),
          f"'noisy' is the map fed the true loss x exp(N(0, {NOISE})), mean over {NOISE_REPS} draws; 'fade' the median DFN fade from cycle 10 to 100.",
          f"resumed designs, mean: 5n {statistics.mean(d['n_5n'] for d in C.values()):.1f}, corr {statistics.mean(d['n_corr'] for d in C.values()):.1f}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "child100":
        print(json.dumps(FL._child100(json.loads(sys.argv[2]))))
    else:
        {"dev": dev, "tables": tables, "bench": bench, "report": report}[cmd]()
