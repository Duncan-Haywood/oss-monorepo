from spot_check import *
from math import inf

T, g = 100, 1.0
print("== E1 flat slash: min audits k vs stake F (T=100, g=1; threshold F >= T*g) ==")
for F in (50, 90, 99, 100, 101, 150):
    print(f"F={F:4d}  k*={min_samples(Params(T, g, F))}")

print("\n== E2 proportional slash: min audits k vs per-hit slash f (predicted ceil(T*g/f)) ==")
for f in (2, 5, 10, 25, 50):
    k = min_samples(Params(T, g, inf, f)); print(f"f={f:3d}  k*={k}  ceil(Tg/f)={-(-T*g//f):.0f}")

print("\n== E3 hybrid (f=10): capital/compute frontier min k vs F ==")
for F, k in frontier(T, g, 10.0, [10, 20, 30, 40, 60, 80, 100]):
    print(f"F={F:4d}  k*={k}")

print("\n== E4 cheapest deterrent, cost = r*F + c*k, hybrid f=10 ==")
Fs = list(range(5, 121, 5))
for r, c in ((0.01, 1.0), (0.1, 1.0), (1.0, 1.0), (1.0, 0.1), (1.0, 0.01)):
    cost, F, k = cheapest_point(T, g, 10.0, Fs, r, c)
    print(f"r={r:<5} c={c:<5} -> F={F:3d} k={k:3d} cost={cost:.2f}")

print("\n== E5 best response under-deterred: hybrid F=40 f=10, vary k ==")
for k in (1, 2, 3, 4, 5, 8):
    j, v = best_response(Params(T, g, 40.0, 10.0), k); print(f"k={k}  j*={j:3d}  gain={v:.2f}")
