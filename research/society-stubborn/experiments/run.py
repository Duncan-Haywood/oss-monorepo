"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (a few minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_stubborn import critical_share, simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M = 200, 500, 12, 0.02, 9
SS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]
RHOS = [round(0.02 * i, 2) for i in range(31)]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


mean = lambda xs: sum(xs) / len(xs)  # noqa: E731

say(f"society-stubborn results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}. "
    "Stubborn people always walk R. Committed robots walk L.")
say()
say("== A. Mean-field tipping share rho_c by stubborn share s (nan = no robot share tips the crowd)")
say("s     " + "  ".join(f"M{m:<5}" for m in (5, 9, 17)))
for s in SS:
    say(f"{s:<5} " + "  ".join(f"{critical_share(s, m, EPS):<6.4f}" for m in (5, 9, 17)))
say()
say("== B. Simulation, M=9: mean final share of ADAPTIVE people on L")
say("rho   " + "  ".join(f"s={s:<4}" for s in SS))
tip, tip5 = {}, {}
for rho in RHOS:
    row, rowp = [], []
    for s in SS:
        rs = [simulate(N, rho, s, M, EPS, ROUNDS, seed=k) for k in range(SEEDS)]
        f = [r["final_share_l"] for r in rs]
        row.append(mean(f))
        rowp.append(mean([x >= 0.9 for x in f]))
        if s not in tip and mean([x >= 0.9 for x in f]) >= 0.5:
            tip[s] = rho
        if s not in tip5 and mean([x >= 0.5 for x in f]) >= 0.5:
            tip5[s] = rho
    say(f"{rho:<5} " + "  ".join(f"{v:<6.3f}" for v in row))
say()
say("== C. Least simulated robot share (grid 0.02) after which at least half of the crowds end with adaptive people past the line, vs mean field")
say("s     >=0.9 on L  >=0.5 on L  mean-field")
for s in SS:
    say(f"{s:<5} {tip.get(s, float('nan')):<11} {tip5.get(s, float('nan')):<11} {critical_share(s, M, EPS):.4f}")
say()
say("== D. Human conflict rate per human meeting, M=9, rho=0.10 / 0.20")
say("s     committed0.10  adaptive0.10  committed0.20  adaptive0.20")
for s in SS:
    c = []
    for rho in (0.10, 0.20):
        for kind in ("committed", "adaptive"):
            c.append(mean([simulate(N, rho, s, M, EPS, ROUNDS, kind, seed=k)["human_conflict_rate"]
                           for k in range(SEEDS)]))
    say(f"{s:<5} {c[0]:<14.3f} {c[1]:<13.3f} {c[2]:<14.3f} {c[3]:.3f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
