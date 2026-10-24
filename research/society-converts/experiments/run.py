"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (a few minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_converts import mean_field_tip_round, simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M, S = 200, 1000, 12, 0.02, 9, 0.4
RHOS = [0.16, 0.20, 0.24, 0.28, 0.32, 0.40]
CS = [0.0, 0.001, 0.003, 0.01, 0.03, 0.1]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


def median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2]


say(f"society-converts results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}, "
    f"stubborn share at start s={S}. Each round every stubborn person converts with probability c.")
say("Tipped = at least half of non-robot humans have a majority-L memory. Reference (society-stubborn, "
    "mean field, M=9): rho_c = 0.217 at s=0, 0.283 at s=0.4.")
say()
runs = {}
for rho in RHOS:
    for c in CS:
        runs[rho, c] = [simulate(N, rho, S, M, EPS, c, ROUNDS, seed=k) for k in range(SEEDS)]
say("== A. Share of the 12 crowds that tipped within the horizon")
say("rho   " + "  ".join(f"c={c:<6}" for c in CS))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(f"{sum(r['tip_round'] is not None for r in runs[rho, c]) / SEEDS:<8.2f}" for c in CS))
say()
say("== B. Median round of tipping among crowds that tipped (- = none tipped)")
say("rho   " + "  ".join(f"c={c:<6}" for c in CS))
for rho in RHOS:
    cells = []
    for c in CS:
        t = [r["tip_round"] for r in runs[rho, c] if r["tip_round"] is not None]
        cells.append(f"{median(t):<8}" if t else f"{'-':<8}")
    say(f"{rho:<5} " + "  ".join(cells))
say()
say("== C. Mean final share of non-robot humans on L")
say("rho   " + "  ".join(f"c={c:<6}" for c in CS))
for rho in RHOS:
    say(f"{rho:<5} " + "  ".join(f"{sum(r['final_share_l'] for r in runs[rho, c]) / SEEDS:<8.3f}" for c in CS))
say()
say("== D. Mean-field one-step relaxation: first round with half of humans on L (- = never within 1000)")
say("rho   " + "  ".join(f"c={c:<6}" for c in CS))
for rho in RHOS:
    cells = []
    for c in CS:
        t = mean_field_tip_round(rho, S, M, EPS, c, ROUNDS)
        cells.append(f"{t if t else '-':<8}")
    say(f"{rho:<5} " + "  ".join(cells))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
