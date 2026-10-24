import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from integperiod import exact_period, simulate

W2 = 9.81 / 1.0  # 1 m pendulum on Earth (g = 9.80665 rounded)
METHODS = ["euler", "semi", "verlet", "rk4"]
print("Pendulum L=1 m, g=9.81; run length 60 s. period err = (sim - exact)/exact; drift = (E_end - E_0)/E_0")
print("\n1. exact period vs small-angle 2*pi/w (large-angle error the twin ignores if linearised)")
for deg in (10, 30, 60, 90, 120, 150):
    t0 = math.radians(deg)
    T = exact_period(t0, W2); Ts = 2 * math.pi / math.sqrt(W2)
    print(f"  theta0={deg:3d} deg  exact T={T:.6f} s  small-angle error {100*(Ts-T)/T:+.3f}%")
print("\n2. timestep sweep at theta0=90 deg (columns: dt, then period err %, energy drift %)")
t0 = math.radians(90); T = exact_period(t0, W2)
print("  dt(s)    " + "  ".join(f"{m:>22s}" for m in METHODS))
for dt in (0.016667, 0.005, 0.004167, 0.002, 0.001, 0.0005):
    row = []
    for m in METHODS:
        p, d, _ = simulate(m, t0, dt, 60.0, W2)
        row.append(f"{100*(p-T)/T:+10.4f} {100*d:+11.4g}")
    print(f"  {dt:.6f} " + "  ".join(row))
print("\n3. amplitude sweep at dt=0.002 s (MuJoCo default) and dt=1/240 s (PyBullet default)")
for dt in (0.002, 1/240):
    print(f"  dt={dt:.6f}")
    print("  theta0   " + "  ".join(f"{m:>22s}" for m in METHODS))
    for deg in (10, 30, 60, 90, 120, 150, 170):
        t0 = math.radians(deg); T = exact_period(t0, W2)
        row = []
        for m in METHODS:
            p, d, _ = simulate(m, t0, dt, 60.0, W2)
            row.append(f"{100*(p-T)/T:+10.4f} {100*d:+11.4g}")
        print(f"  {deg:4d}deg  " + "  ".join(row))
print("\n4. convergence order: slope of log|period err| vs log dt at theta0=90 deg, dt 0.004 -> 0.001")
t0 = math.radians(90); T = exact_period(t0, W2)
for m in METHODS:
    e = [abs(simulate(m, t0, dt, 60.0, W2)[0] - T) for dt in (0.004, 0.002, 0.001)]
    s = [math.log(e[i] / e[i+1]) / math.log(2) for i in range(2)]
    print(f"  {m:7s} errors {e[0]:.3e} {e[1]:.3e} {e[2]:.3e}  order {s[0]:.2f}, {s[1]:.2f}")
print("\n5. does the start convention matter? theta0=90 deg, 600 s, period err in parts per million")
t0 = math.radians(90); T = exact_period(t0, W2)
print("  dt(s)     method  from rest at theta0   from bottom, exact energy")
for dt in (0.004, 0.002, 0.001):
    for m in ("semi", "verlet"):
        a = simulate(m, t0, dt, 600.0, W2)[0]
        b = simulate(m, t0, dt, 600.0, W2, start="bottom")[0]
        print(f"  {dt:.3f}     {m:7s} {1e6*(a-T)/T:+18.4f} {1e6*(b-T)/T:+24.4f}")
print("\n6. absolute period error in ppm, theta0=90 deg, started at the bottom with exact energy, 120 s")
print("   dt(s)      euler       semi     verlet        rk4")
for dt in (0.016, 0.008, 0.004, 0.002, 0.001, 0.0005):
    v = [1e6 * abs(simulate(m, t0, dt, 120.0, W2, start="bottom")[0] - T) / T for m in METHODS]
    print(f"  {dt:.4f} " + " ".join(f"{x:10.4g}" for x in v))
