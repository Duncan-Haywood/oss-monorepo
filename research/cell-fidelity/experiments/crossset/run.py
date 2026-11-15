"""Milestone 5w: does 5v's self-limiting correction of the ten-cycle lithium law carry to other cell chemistries when
its intercept is recalibrated on 8 designs per pool and its slope is kept from Ai2020?

    python experiments/crossset/run.py dev       # the dev numbers in the 5w plan, from committed pools (stdlib)
    python experiments/crossset/run.py tables    # balance tables and stack mass of the fresh designs (pybamm, no simulation)
    WORKERS=2 python experiments/crossset/run.py bench   # DFN (SEI + plating) to cycle 100 with the lithium curve (resumable)
    python experiments/crossset/run.py report    # H126 to H130 (stdlib) -> results.txt, summary.json

5v fixed the balance map's ranking on fresh Ai2020 pools with L_corr = L_law / exp(A + S ln(L_law / n_Li)), A = 0.658,
S = 0.577 frozen. Its own dev showed NCA_Kim2011 wants another slope (0.81), and Chen2020 / OKane2022 were never tried.
Dev here (committed pools, seen): refitting both constants on 8 random designs is unstable (S from -0.42 to 1.69 over
50 draws on 5u's NCA_Kim2011 pool; held-out map rank as low as -0.08), while refitting only A with S kept at 0.577 holds
the held-out rank at 0.48 to 0.54 on NCA_Kim2011 and 0.88 to 0.97 on the five Ai2020 pools. So the predictor fixed
here is the one-constant calibration: run 8 designs (fixed seed) of a new pool to cycle 100, set A to the mean of
ln(L_law / L_DFN) - 0.577 ln(L_law / n_Li) over them, and score the rest. Plan in ../../LOG.md (5w plan).
"""
import importlib.util
import json
import math
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


CM = _mod("calmap_run", EXP / "calmap" / "run.py")
FL, S, B = CM.FL, CM.S, CM.B
spearman, sign_p = B.spearman, FL.sign_p

SOBOL_SEED = 16        # used by no milestone (5v used 15)
# fixed before any run: one pool on each set 5v did not test, at a current with real fade (5s's rule: median DFN fade
# from cycle 10 to 100 >= 0.2 on that set at a neighbouring current); new designs on all three
CONDITIONS = ("NCA_Kim2011@0.875x", "Chen2020@1.5x", "OKane2022@1.5x")
S_FROZEN, A_AI2020 = CM.S_FROZEN, CM.A_FROZEN
N_CAL = 8              # designs per pool run to cycle 100 to set A
CAL_SEED = 0           # which 8 (random.Random(CAL_SEED).sample over the pool's completed designs, in design order)
DRAWS = 50             # descriptive: the same test over 50 calibration draws


# ---------- pure helpers (stdlib; tested) ----------

def fit_intercept(triples, s=S_FROZEN):
    """A = mean of ln(L_law / L_true) - s ln(L_law / n_Li) over (l_law, l_true, n_li) triples (slope held at s)."""
    v = [math.log(lw / lt) - s * math.log(lw / n) for lw, lt, n in triples if lw and lw > 0 and lt > 0 and n > 0]
    return statistics.mean(v) if v else None


def split(n, k=N_CAL, seed=CAL_SEED):
    """Indices of the k calibration designs and of the held-out rest."""
    cal = sorted(random.Random(seed).sample(range(n), min(k, n)))
    return cal, [i for i in range(n) if i not in set(cal)]


def triples(rows, idx):
    return [(rows[i]["l_law"], rows[i]["l_true"], rows[i]["n_li"]) for i in idx]


def score_held(rows, seed=CAL_SEED):
    """Metrics on the held-out designs for the frozen 5v map, the one-constant (A) and two-constant (A, S) calibrations."""
    cal, held = split(len(rows), seed=seed)
    tr = triples(rows, cal)
    a1 = fit_intercept(tr)
    a2, s2 = CM.fit_correction(tr)
    H = [rows[i] for i in held]
    one = CM.evaluate(H, a1, S_FROZEN, cal=(a2, s2))
    frozen = CM.evaluate(H, A_AI2020, S_FROZEN)
    return dict(n_held=len(H), a1=a1, a2=a2, s2=s2,
                rho_raw=one["rho_raw"], rho_sqrt=one["rho_sqrt"], rho_law=one["rho_law"], rho_one=one["rho_corr"],
                rho_two=one["rho_selfcal"], rho_frozen=frozen["rho_corr"], rho_true_map=one["rho_true_map"],
                lerr_law=one["lerr_law"], lerr_one=one["lerr_corr"], lerr_frozen=frozen["lerr_corr"],
                gap_5n=one["gap_5n"], n_5n=one["n_5n"], gap_one=one["gap_corr"], n_one=one["n_corr"],
                gap_two=one["gap_selfcal"], fade=one["fade_dfn_median"])


def verdicts(C):
    T = list(C.values())
    n = len(T)
    w = sum(c["rho_one"] > c["rho_sqrt"] for c in T)
    return dict(n=n,
                H126=S.verdict(w == n, w <= n - 2), H126_wins=w, p126=sign_p(w, n),
                H127=S.verdict(all(c["lerr_one"] <= 0.06 for c in T), any(c["lerr_one"] > 0.10 for c in T)),
                H128=S.verdict(sum(c["lerr_frozen"] > 0.06 for c in T) >= 2, all(c["lerr_frozen"] <= 0.06 for c in T)),
                H129=S.verdict(all(c["gap_one"] <= 0.005 for c in T), any(c["gap_one"] > 0.02 for c in T)),
                H130=S.verdict(sum(c["rho_one"] >= c["rho_two"] for c in T) == n,
                               sum(c["rho_one"] >= c["rho_two"] for c in T) <= n - 2))


# ---------- commands ----------

def dev():
    """Committed pools (seen): one- and two-constant calibration over DRAWS draws of 8; prints the plan's dev table."""
    for d, conds in ((EXP / "freshlaw", FL.CONDITIONS), (EXP / "calmap", CM.CONDITIONS)):
        runs, bal, ocp = CM._load(d)
        for c in conds:
            rows = CM.rows_of(c, runs, bal, ocp)[0]
            # noise reps are not needed here and cost most of evaluate's time
            reps, CM.NOISE_REPS = CM.NOISE_REPS, 1
            D = [score_held(rows, seed=s) for s in range(DRAWS)]
            CM.NOISE_REPS = reps
            q = lambda k: f"{statistics.median(x[k] for x in D):.3f} [{min(x[k] for x in D):.3f}]"
            print(f"{c:20s} one {q('rho_one')}  two {q('rho_two')}  frozen {q('rho_frozen')}  sqrt {q('rho_sqrt')}  "
                  f"raw {q('rho_raw')}  S2 {min(x['s2'] for x in D):.2f}..{max(x['s2'] for x in D):.2f}")


def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS = HERE, SOBOL_SEED, CONDITIONS
    FL.tables()


def bench():
    FL.HERE = HERE
    FL.bench()


def report():
    runs, bal, ocp = CM._load(HERE)
    C, Rows, Draws = {}, {}, {}
    for c in CONDITIONS:
        rows, b_med, law, dropped = CM.rows_of(c, runs, bal, ocp)
        if len(rows) < N_CAL + 8:
            continue
        C[c] = score_held(rows) | dict(n=len(rows), b_med=b_med, law_name=law, dropped=dropped,
                                       s_pool=CM.fit_correction(triples(rows, range(len(rows))))[1])
        reps, CM.NOISE_REPS = CM.NOISE_REPS, 1
        D = [score_held(rows, seed=s) for s in range(DRAWS)]
        CM.NOISE_REPS = reps
        Draws[c] = {k: dict(median=statistics.median(x[k] for x in D), min=min(x[k] for x in D))
                    for k in ("rho_one", "rho_two", "rho_frozen", "rho_sqrt", "gap_one", "gap_5n")}
        Draws[c]["wins_one_over_sqrt"] = sum(x["rho_one"] > x["rho_sqrt"] for x in D)
        Rows[c] = [{k: v for k, v in r.items() if k not in ("b", "lost")} for r in rows]
    V = verdicts(C)
    L = [f"cell-fidelity milestone 5w: 5v's corrected map with A recalibrated on {N_CAL} designs per pool (S = {S_FROZEN} kept"
         f" from Ai2020); fresh pools: 64 Sobol designs (seed {SOBOL_SEED}) x {len(CONDITIONS)} sets, DFN (SEI + plating) to cycle 100;"
         f" every rank and gap below is on the held-out designs", "",
         f"{'condition':20s}{'n':>4s}{'drop':>5s}{'law':>6s}{'A1':>7s}{'S pool':>7s}{'rhoE raw':>9s}{'sqrtE':>7s}{'law':>7s}"
         f"{'frozen':>7s}{'one':>7s}{'two':>7s}{'trueL':>7s}{'|lnerr| law':>12s}{'frozen':>7s}{'one':>7s}"
         f"{'gap 5n':>8s}{'one':>7s}{'two':>7s}{'fade':>6s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:4d}{d['dropped']:5d}{d['law_name']:>6s}{d['a1']:7.3f}{d['s_pool']:7.3f}{d['rho_raw']:9.3f}"
                 f"{d['rho_sqrt']:7.3f}{d['rho_law']:7.3f}{d['rho_frozen']:7.3f}{d['rho_one']:7.3f}{d['rho_two']:7.3f}"
                 f"{d['rho_true_map']:7.3f}{d['lerr_law']:12.3f}{d['lerr_frozen']:7.3f}{d['lerr_one']:7.3f}"
                 f"{d['gap_5n']:8.4f}{d['gap_one']:7.4f}{d['gap_two']:7.4f}{d['fade']:6.3f}")
    n = V["n"]
    L += ["",
          f"H126 (one-constant map ranks held-out DFN@100 above 5n's sqrt energy fit on all {n}): {V['H126']} ({V['H126_wins']} of {n}, sign p = {V['p126']:.3f})",
          f"H127 (one-constant map: median |ln(L_corr / L_DFN)| at cycle 99 <= 0.06 on every pool): {V['H127']}",
          f"H128 (5v's frozen Ai2020 constants miss the loss size, |ln err| > 0.06, on at least 2 of {n}): {V['H128']}",
          f"H129 (union raw top 4 + one-constant top 4 within 0.5% of the held-out DFN best on every pool): {V['H129']}",
          f"H130 (one-constant ranks at least as well as the two-constant refit on all {n}): {V['H130']}", "",
          f"Descriptive, over {DRAWS} calibration draws (median [min]):"]
    for c, d in Draws.items():
        L.append(f"  {c:20s} " + "  ".join(f"{k} {v['median']:.3f} [{v['min']:.3f}]" for k, v in d.items() if isinstance(v, dict))
                 + f"  one > sqrt in {d['wins_one_over_sqrt']} of {DRAWS}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, draws=Draws, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[cmd]()
