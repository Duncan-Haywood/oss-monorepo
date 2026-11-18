"""Milestone 5e: how much rated power does a PEAKY lowering profile need, against 5d's flat-profile cap?

5d capped recovered energy by P_max * t_w on a flat (constant-power) lowering. Real lowering ramps
up and down, so the same energy arrives at a higher peak. For a unit-energy profile of duration T
shaped p(t) (flat, trapezoid with 20% ramps, half-sine, triangle) we compute the fraction of the
energy a device rated P can take, E(P)/E = integral min(p, P) dt / integral p dt, and the rating
that takes 95% / 99%, as a multiple of the flat-profile mean power E/T. Shapes are swept, not
measured: no excavator boom-lowering trace is used. Stdlib only, deterministic.
"""
import math

N = 20000  # midpoint rule

def shape(name):
    def f(x):  # x in (0,1)
        if name == "flat": return 1.0
        if name == "trapezoid20":
            r = 0.2
            return min(x / r, 1.0, (1 - x) / r)
        if name == "halfsine": return math.sin(math.pi * x)
        if name == "triangle": return 1 - abs(2 * x - 1)
        raise ValueError(name)
    return f

def profile(name):
    f = shape(name)
    xs = [(i + .5) / N for i in range(N)]
    p = [f(x) for x in xs]
    mean = sum(p) / N
    return [v / mean for v in p]  # mean 1: power in units of the mean power E/T

def captured(p, cap):
    return sum(min(v, cap) for v in p) / sum(p)

def rating_for(p, frac):
    lo, hi = 0.0, max(p)
    for _ in range(60):
        mid = (lo + hi) / 2
        if captured(p, mid) >= frac: hi = mid
        else: lo = mid
    return hi

if __name__ == "__main__":
    print(f"{'shape':12} {'peak/mean':>9} {'rating for 95%':>15} {'for 99%':>9} {'share at rating=mean':>21} {'at 1.5x mean':>13}")
    for n in ("flat", "trapezoid20", "halfsine", "triangle"):
        p = profile(n)
        print(f"{n:12} {max(p):9.3f} {rating_for(p, .95):15.3f} {rating_for(p, .99):9.3f} {captured(p, 1.0):21.3f} {captured(p, 1.5):13.3f}")
    # applied to 5d's operating points: median mean recovery power 823 W (central) and 2,921 W (upper corner), 2.5 s
    print("\nRated power (kW) to take 95% of the drop over 2.5 s, from 5d's median mean recovery power:")
    for pt, mw in (("central", 823.0), ("upper corner", 2921.0)):
        row = ", ".join(f"{n} {rating_for(profile(n), .95) * mw / 1e3:.2f}" for n in ("flat", "trapezoid20", "halfsine", "triangle"))
        print(f"  {pt}: {row}")
