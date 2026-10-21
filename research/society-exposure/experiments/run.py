"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (a few minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_exposure import matched_c, simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M, S = 200, 1000, 12, 0.02, 9, 0.4
RHOS = [0.16, 0.20, 0.24, 0.28, 0.32]
KS = [None, 30, 10, 3, 1]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]


def label(k):
    return "k=inf" if k is None else f"k={k}"


def cell(runs):
    t = [r["tip_round"] for r in runs if r["tip_round"] is not None]
    return f"{len(t)}/{len(runs)}" + (f" ({median(t)})" if t else "")


say(f"society-exposure results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}, "
    f"stubborn share at start s={S}. A stubborn person converts after meeting a committed robot k times.")
say("Cell = crowds tipped / seeds (median tipping round). Tipped = at least half of non-robot humans have a "
    "majority-L memory. Reference (society-stubborn, mean field, M=9): rho_c = 0.217 at s=0, 0.283 at s=0.4.")
say()
exp, mat = {}, {}
for rho in RHOS:
    for k in KS:
        exp[rho, k] = [simulate(N, rho, S, M, EPS, k, 0.0, ROUNDS, seed=i) for i in range(SEEDS)]
        if k is not None:
            mat[rho, k] = [simulate(N, rho, S, M, EPS, None, matched_c(rho, k), ROUNDS, seed=i)
                           for i in range(SEEDS)]
say("== A. Exposure conversion: crowds tipped / 12 (median round)")
say("rho   " + "  ".join(f"{label(k):<12}" for k in KS))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(f"{cell(exp[rho, k]):<12}" for k in KS))
say()
say("== B. Exposure-blind conversion at the matched rate c = rho / k (same mean time to convert)")
say("rho   " + "  ".join(f"{label(k):<12}" for k in KS[1:]))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(f"{cell(mat[rho, k]):<12}" for k in KS[1:]))
say()
say("== C. Mean share of the starting stubborn block still stubborn at round 1000, exposure conversion")
say("rho   " + "  ".join(f"{label(k):<8}" for k in KS))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(
        f"{sum(r['final_stubborn'] for r in exp[rho, k]) / SEEDS / S:<8.3f}" for k in KS))
say()
say("== D. Mean final share of non-robot humans on L, exposure conversion")
say("rho   " + "  ".join(f"{label(k):<8}" for k in KS))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(
        f"{sum(r['final_share_l'] for r in exp[rho, k]) / SEEDS:<8.3f}" for k in KS))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
