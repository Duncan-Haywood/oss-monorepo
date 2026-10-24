"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded), standard library only.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_grid import meanfield_threshold, simulate  # noqa: E402

W, ROUNDS, SEEDS, EPS, M = 16, 500, 20, 0.02, 9
N = W * W
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def cell(rho, block, k):
    rs = [simulate(w=W, rho=rho, block=block, k=k, m=M, eps=EPS, rounds=ROUNDS, seed=s) for s in range(SEEDS)]
    return (sum(r["final_share_l"] for r in rs) / SEEDS,
            sum(r["final_share_l"] >= 0.9 for r in rs) / SEEDS,
            sum(r["human_conflict_rate"] for r in rs) / SEEDS)


def fmt(c):
    return f"{c[0]:.3f}/{c[1]:.2f}/{c[2]:.3f}"


say(f"society-grid results. N={N} agents on a {W}x{W} torus, {ROUNDS} rounds (~{ROUNDS} meetings per agent), "
    f"{SEEDS} seeds per cell, memory M={M}, error eps={EPS}. People start on R; committed robots walk L.")
say("A partner sits within Chebyshev distance k (uniform over the (2k+1)^2-1 sites). A patch of b robots fills a ceil(sqrt(b))-wide square.")
say("Each cell: mean final share of people on L / fraction of crowds with at least 90% of people on L / conflicts per human meeting.")
say()
say(f"== A. Check against the well-mixed mean-field: threshold {meanfield_threshold(M, EPS):.4f} (M={M}, eps={EPS}); "
    f"k=7 is nearly well mixed on a {W}-wide torus (225 of 255 other sites)")
say("rho    spread (b=1), k=7")
for rho in (0.14, 0.18, 0.22, 0.26, 0.30):
    say(f"{rho:.2f}   {fmt(cell(rho, 1, 7))}")
say()
BLOCKS = [1, 2, 4, 9, 16, 25]
say("== B. Patch size sweep (robots per patch b; patch side ceil(sqrt(b))), k=2")
RHOS = (0.12, 0.20, 0.25, 0.35)
say("b      side " + "".join(f"rho={r:<22}" for r in RHOS))
for b in BLOCKS:
    side = int(b ** 0.5 + 0.999)
    say(f"{b:<6} {side:<4} " + "".join(f"{fmt(cell(r, b, 2))}   " for r in RHOS))
say()
for RHO in (0.25, 0.35):
    say(f"== C. Neighbourhood radius k and patch size b, rho={RHO} (well-mixed threshold 0.2165, so every column would tip if mixed)")
    KS = [1, 2, 3, 5]
    CB = [1, 4, 9, 16, 25, 36, 64]
    say("b      side " + "".join(f"k={k:<24}" for k in KS))
    for b in CB:
        side = int(b ** 0.5 + 0.999)
        say(f"{b:<6} {side:<4} " + "".join(f"{fmt(cell(RHO, b, k))}   " for k in KS))
    say()
(HERE / "results.txt").write_text("\n".join(out) + "\n")
