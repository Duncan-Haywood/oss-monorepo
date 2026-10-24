"""Bracket the society-ringmf gap: mean-field (deterministic, independent memory) vs resampled
(noisy, independent memory) vs society-allies simulation (noisy, persistent memory).

    python3 experiments/run.py      (about 12 minutes)

Deterministic (seeded), standard library only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-allies" / "src"))
sys.path.insert(0, str(HERE.parents[1] / "society-ringmf" / "src"))
from society_ringnoise import resampled  # noqa: E402
from society_allies import simulate  # noqa: E402
from society_ringmf import fixed_point  # noqa: E402

N, SEEDS, EPS, M = 200, 20, 0.02, 9
RHOS = [round(0.02 * i, 2) for i in range(1, 21)]
CELLS = [(b, k) for k in (2, 3) for b in (1, 4, 8)]
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def first(vals, thr):
    for r, v in zip(RHOS, vals):
        if v >= thr:
            return f"{r:.2f}"
    return "none"


say(f"society-ringnoise. N={N}, M={M}, eps={EPS}, {SEEDS} seeds per cell; rho grid 0.02..0.40.")
say("Threshold = smallest rho where the mean share on L is >= 0.9 (mean-field) or >= 0.5 of crowds have >= 0.9 on L (others).")
say("resampled: 300 synchronous sweeps, each person = majority of 9 fresh partner plays (noise, no memory persistence).")
say("simulation: society-allies, 500 rounds (noise and persistent memory).")
say()
say("block  k   mean-field  resampled  simulation")
for b, k in CELLS:
    mf = [fixed_point(n=N, rho=r, block=b, k=k, m=M, eps=EPS)[0] for r in RHOS]
    rs = [sum(resampled(n=N, rho=r, block=b, k=k, m=M, eps=EPS, seed=s) >= 0.9 for s in range(SEEDS)) / SEEDS for r in RHOS]
    sm = [sum(simulate(n=N, rho=r, block=b, k=k, m=M, eps=EPS, rounds=500, seed=s)["final_share_l"] >= 0.9 for s in range(SEEDS)) / SEEDS for r in RHOS]
    say(f"{b:>5} {k:>2}   {first(mf, 0.9):>9}  {first(rs, 0.5):>9}  {first(sm, 0.5):>10}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
