"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded), standard library only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_allies import simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M = 200, 500, 20, 0.02, 9
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def cell(rho, block, k):
    rs = [simulate(n=N, rho=rho, block=block, k=k, m=M, eps=EPS, rounds=ROUNDS, seed=s) for s in range(SEEDS)]
    return (sum(r["final_share_l"] for r in rs) / SEEDS,
            sum(r["final_share_l"] >= 0.9 for r in rs) / SEEDS,
            sum(r["human_conflict_rate"] for r in rs) / SEEDS)


say(f"society-allies results. N={N} agents on a ring, {ROUNDS} rounds (~{ROUNDS} meetings per agent), "
    f"{SEEDS} seeds per cell, memory M={M}, error eps={EPS}. People start on R; committed robots walk L.")
say("Each cell: mean final share of people on L / fraction of crowds with at least 90% of people on L / conflicts per human meeting.")
say()
say("== A. Check against society-robotnorms section E (k=2): block 1 is 'evenly spread', block = all robots is 'one block'")
say("rho    spread(block 1)      one block")
for rho in (0.04, 0.08, 0.12, 0.20, 0.50):
    a, b = cell(rho, 1, 2), cell(rho, round(rho * N), 2)
    say(f"{rho:.2f}   {a[0]:.3f}/{a[1]:.2f}/{a[2]:.3f}   {b[0]:.3f}/{b[1]:.2f}/{b[2]:.3f}")
say()
BLOCKS = [1, 2, 3, 4, 6, 8, 12, 24]
for sec, k in (("B", 2),):
    say(f"== {sec}. Block size sweep, k={k}")
    say("block " + "".join(f"rho={r:<24}" for r in (0.08, 0.12, 0.20, 0.30)))
    for b in BLOCKS:
        cells = [cell(r, b, k) for r in (0.08, 0.12, 0.20, 0.30)]
        say(f"{b:<6}" + "".join(f"{c[0]:.3f}/{c[1]:.2f}/{c[2]:.3f}      " for c in cells))
    say()
say("== C. Neighbourhood size k and block size, rho=0.20")
KS = [1, 2, 3, 5, 10]
CB = [1, 2, 4, 8, 16]
say("block " + "".join(f"k={k:<26}" for k in KS))
for b in CB:
    cells = [cell(0.20, b, k) for k in KS]
    say(f"{b:<6}" + "".join(f"{c[0]:.3f}/{c[1]:.2f}/{c[2]:.3f}      " for c in cells))
say()
(HERE / "results.txt").write_text("\n".join(out) + "\n")
