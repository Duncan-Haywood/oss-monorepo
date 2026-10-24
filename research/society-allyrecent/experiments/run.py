"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (about 5 minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_allyrecent import simulate, tipped  # noqa: E402

N, ROUNDS, SEEDS, EPS, M, SL = 200, 1500, 12, 0.02, 9, 0.2
CS = [0.01, 0.03]
RHOS = [0.05, 0.10, 0.15]
KS = [1, 3, 5, 9]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


say(f"society-allyrecent results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}, allies sl={SL}. "
    "Cells: crowds tipped of 12 / mean allies left at the end.")
for c in CS:
    say()
    say(f"== c={c}")
    say("rule        " + "  ".join(f"rho={r:<9}" for r in RHOS))
    for name, fade, k in [("constant", "const", 9)] + [(f"watch k={k}", "watch", k) for k in KS]:
        row = []
        for rho in RHOS:
            rs = [simulate(n=N, rho=rho, sl=SL, c=c, fade=fade, k=k, m=M, eps=EPS, rounds=ROUNDS, seed=s) for s in range(SEEDS)]
            row.append(f"{sum(map(tipped, rs)):>2}/{SEEDS} {sum(r['allies_left'] for r in rs) / SEEDS:>5.1f}  ")
        say(f"{name:<11} " + "".join(row))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
