"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_handover import simulate, tipped  # noqa: E402

N, ROUNDS, SEEDS, EPS, M, SL = 200, 2000, 12, 0.02, 9, 0.2
CS = [0.003, 0.01, 0.03, 0.1]
HS = [0.0, 0.1, 0.2, 0.3, 0.5, 1.0]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


say(f"society-handover results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M}, allies sl={SL}. "
    "Cells: crowds tipped of 12 / mean robots at the end as a share of n. h = chance a fading ally becomes a robot.")
for rho0 in (0.0, 0.02, 0.05, 0.10):
    say()
    say(f"== initial robot share rho0={rho0}")
    say("c       " + "  ".join(f"h={h:<9}" for h in HS))
    for c in CS:
        row = []
        for h in HS:
            rs = [simulate(n=N, rho0=rho0, sl=SL, c=c, h=h, m=M, eps=EPS, rounds=ROUNDS, seed=s) for s in range(SEEDS)]
            k = sum(map(tipped, rs))
            rob = sum(r["robot_share"] for r in rs) / SEEDS
            row.append(f"{k:>2}/{SEEDS} {rob:.3f}  ")
        say(f"{c:<7} " + "".join(row))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
