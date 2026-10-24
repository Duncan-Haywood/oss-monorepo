import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from keplerdrift import run, precession_per_orbit

M = ["euler", "semi", "verlet", "rk4"]
print("Kepler problem, GM=1, a=1, period 2*pi, start at periapsis. Exact solution from Kepler's equation.")
print("pos err = distance to exact position after the run (a = 1); dE = relative energy change at the end")
print("\n1. 100 steps per orbit, 10 orbits, eccentricity sweep: |position error| (units of a; the largest possible is 2a, so values near 2 mean the phase is lost)")
print("  e     " + " ".join(f"{m:>12s}" for m in M))
for e in (0.0, 0.1, 0.3, 0.5, 0.7, 0.9):
    print(f"  {e:.2f}  " + " ".join(f"{run(m, e, 100, 10)['pos_err']:12.4g}" for m in M))
print("\n2. same runs: worst relative energy excursion at any step")
print("  e     " + " ".join(f"{m:>12s}" for m in M))
for e in (0.0, 0.1, 0.3, 0.5, 0.7, 0.9):
    print(f"  {e:.2f}  " + " ".join(f"{run(m, e, 100, 10)['worst_dE']:12.4g}" for m in M))
print("\n3. steps per orbit needed for position error < 0.01 a after 10 orbits (first n where n, 2n and 4n all pass; search up to 2^13)")
print("  e     " + " ".join(f"{m:>12s}" for m in M))
for e in (0.0, 0.3, 0.7, 0.9):
    row = []
    for m in M:
        n, ok = 16, None
        while n <= 2 ** 13:  # first n at which n, 2n and 4n all pass, so a lucky phase alignment does not count
            if all(run(m, e, k, 10)["pos_err"] < 0.01 for k in (n, 2 * n, 4 * n)):
                ok = n; break
            n *= 2
        row.append(f"{ok if ok else '>8192':>12}")
    print(f"  {e:.2f}  " + " ".join(row))
print("\n4. periapsis direction (rad, exact 0) at e=0.5, 100 steps per orbit, after k orbits: the symplectic methods' angle wanders, RK4's grows linearly")
print("  orbits" + " ".join(f"{m:>12s}" for m in M))
for k in (1, 2, 5, 10, 20, 50, 200):
    print(f"  {k:5d} " + " ".join(f"{k * precession_per_orbit(m, 0.5, 100, k):12.4g}" for m in M))
print("\n4b. same after 1 orbit against steps per orbit")
print("  steps " + " ".join(f"{m:>12s}" for m in M))
for n in (50, 100, 200, 400, 800):
    print(f"  {n:5d} " + " ".join(f"{precession_per_orbit(m, 0.5, n, 1):12.4g}" for m in M))
print("\n5. position error against steps per orbit, e=0.5, 10 orbits")
print("  steps " + " ".join(f"{m:>12s}" for m in M))
for n in (50, 100, 200, 400, 800, 1600):
    print(f"  {n:5d} " + " ".join(f"{run(m, 0.5, n, 10)['pos_err']:12.4g}" for m in M))
