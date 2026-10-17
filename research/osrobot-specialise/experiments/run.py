"""Sweeps work-area side and placement tolerance; prints the tables in results.txt."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_specialise.model import evaluate, arm_wins

Ls = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 2.0]
print("Per design at placement tolerance 2 mm (radius), 2000 random pick/place pairs, seed 1")
print(f"{'L(m)':>5} {'design':>7} {'cost':>7} {'cycle(s)':>9} {'succ':>6} {'J/pick':>7} {'good/h':>8} {'cost per good/h':>16}")
for L in Ls:
    for d in ("gantry", "arm"):
        r = evaluate(d, L, 0.002)
        if r is None:
            print(f"{L:5.1f} {d:>7}  not buildable (needs reach > 1 m or point unreachable)")
        else:
            print(f"{L:5.1f} {d:>7} {r['cost']:7.0f} {r['cycle_s']:9.2f} {r['success']:6.3f} {r['energy_j']:7.2f} "
                  f"{r['picks_per_h']:8.0f} {r['cost']/r['picks_per_h']:16.3f}")
print()
fine = [round(0.05 + 0.01 * i, 2) for i in range(200)]
print("Where the arm has the lower cost per good pick/h (side L in m; 0.01 m grid, 0.05 to 2.04 m)")
for tol in (0.0005, 0.001, 0.002, 0.005, 0.01, 0.02):
    w = arm_wins(tol, fine)
    print(f"  tolerance {tol*1000:5.1f} mm: " + (f"{w[0]:.2f} to {w[-1]:.2f} m ({len(w)} grid points)" if w else "never"))

print()
print("Sensitivity at 2 mm tolerance: band of L (m) where the arm wins when one assumed parameter is scaled")
from osrobot_specialise import model as M
for d, k in ((M.G, "cost_per_m"), (M.A, "cost_per_m2"), (M.A, "sigma_angle"), (M.G, "sigma"), (M.A, "wmax"), (M.A, "tau")):
    for f in (0.5, 1.0, 2.0):
        old = d[k]; d[k] = old * f
        w = arm_wins(0.002, fine)
        d[k] = old
        name = ("G." if d is M.G else "A.") + k
        print(f"  {name:>14} x{f:<3}: " + (f"{w[0]:.2f} to {w[-1]:.2f} m" if w else "never"))
