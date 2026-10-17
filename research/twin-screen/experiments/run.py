"""Experiments for twin-screen.  PYTHONPATH=src python3 experiments/run.py > experiments/results.txt (seeded)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from twin_screen import *

K, B, N = 50, 20, 20000
MS = (1, 2, 3, 5, 8, 12, 20, 35, 50)
print(f"K={K} designs, real budget B={B} unit-variance trials, {N} Monte-Carlo draws per cell; values in sd of the design distribution")
print(f"oracle (best design known) = {oracle_value(K):.3f}; real-only (m=K) uses s_each=sqrt(K/B)={sd_each(K, B):.3f}")
print()
print("== E1 value of the chosen design vs shortlist size m (columns: rho)")
RH = (0.0, 0.3, 0.6, 0.8, 0.95)
print("m   " + " ".join(f"rho={r:<5}" for r in RH))
tab = {}
for m in MS:
    row = [screen_value_mc(K, m, r, B, N, 100 + m)[0] for r in RH]
    tab[m] = row
    print(f"{m:<3} " + " ".join(f"{v:9.3f}" for v in row))
print()
print("== E2 twin-only value rho*c_K (exact) and best shortlist size on the grid, by rho")
print("rho  twin_only  best_m  best_value  real_only(m=K)  gain_over_real_only")
for j, r in enumerate(RH):
    bm = max(MS, key=lambda m: tab[m][j])
    print(f"{r:<4} {twin_only_value(r, K):9.3f}  {bm:<6}  {tab[bm][j]:9.3f}  {tab[K][j]:13.3f}  {tab[bm][j] - tab[K][j]:9.3f}")
print()
print("== E3 best m (and value) vs real budget B at rho=0.6")
print("B     best_m  value")
for b in (5, 10, 20, 50, 200, 1000):
    res = [(m, screen_value_mc(K, m, 0.6, b, 8000, 500 + m)[0]) for m in MS]
    m, v = max(res, key=lambda r: r[1])
    print(f"{b:<5} {m:<7} {v:.3f}")
