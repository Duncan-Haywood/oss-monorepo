"""Seeded experiments for nlos-twin.  Output is experiments/results.txt."""
import math, random, statistics as st
from nlos_twin import *

R = 20000


def errs(A, x, p, m, sigma, seed, fixer=None, reps=R, nlos=True):
    rng = random.Random(seed)
    out = []
    for _ in range(reps):
        r = simulate(A, x, p, m, sigma, rng, nlos_on=nlos)
        f = fixer(A, r) if fixer else fix(A, r, x0=(0.0, 0.0))
        out.append((f[0] - x[0], f[1] - x[1]))
    return out


def rms(e):
    return math.sqrt(sum(a * a + b * b for a, b in e) / len(e))


def q(e, pr):
    d = sorted(math.hypot(a, b) for a, b in e)
    return d[int(pr * (len(d) - 1))]


sigma, m = 0.3, 3.0
print("1. Uniform NLOS on a centred ring (sigma=0.3 m, excess mean m=3 m): rms position error, twin vs real")
print("   law: rms = GDOP*sqrt(sigma^2 + p(2-p)m^2); bias ~0 by symmetry")
for n in (4, 6, 12):
    A = ring(n)
    g = gdop(A)
    for p in (0.1, 0.3):
        e = errs(A, (0, 0), p, m, sigma, 10 + n)
        law = g * math.sqrt(sigma ** 2 + p * (2 - p) * m ** 2)
        print(f"   n={n:2d} p={p}: twin {g*sigma:.3f}  law {law:.3f}  sim {rms(e):.3f}  ratio sim/twin {rms(e)/(g*sigma):.1f}x  "
              f"mean=({st.mean(a for a,_ in e):+.3f},{st.mean(b for _,b in e):+.3f})")

print("\n2. Structured NLOS: the anchors on one side (a wall) are blocked.  n=8 ring; anchors 0..k-1 have NLOS w.p. 1 with mean excess m=2")
A = ring(8)
for k in (1, 2, 3):
    nl = [2.0] * k + [0.0] * (8 - k)
    b = ls_bias(A, (0, 0), nl)
    rng = random.Random(30 + k)
    es = []
    for _ in range(R):
        r = [math.hypot(ax, ay) + rng.gauss(0, sigma) + (rng.expovariate(1 / 2.0) if i < k else 0) for i, (ax, ay) in enumerate(A)]
        es.append(fix(A, r))
    print(f"   k={k}: predicted bias ({b[0]:+.3f},{b[1]:+.3f}) |b|={math.hypot(*b):.3f}   sim mean ({st.mean(a for a,_ in es):+.3f},{st.mean(c for _,c in es):+.3f})  twin bias 0")

print("\n3. Safety: position must be within a 1.0 m corridor 95% of the time.  Anchors needed on a ring (R=50 m), sigma=0.3")
for p in (0.0, 0.1, 0.2):
    need = None
    for n in range(4, 61):
        A = ring(n)
        e = errs(A, (0, 0), p, m, sigma, 100 + n, reps=2000)
        if q(e, 0.95) <= 1.0:
            need = n
            break
    twin = None
    for n in range(4, 61):
        A = ring(n)
        e = errs(A, (0, 0), 0.0, m, sigma, 200 + n, reps=2000, nlos=False)
        if q(e, 0.95) <= 1.0:
            twin = n
            break
    print(f"   p={p}: twin says {twin} anchors; real site (NLOS p) needs {need}")
    if p == 0.2:
        A = ring(twin)
        e = errs(A, (0, 0), p, m, sigma, 300)
        print(f"   twin-sized ring ({twin}): real 95th-pct error {q(e,0.95):.2f} m, P(error>1m) = {sum(math.hypot(a,b)>1 for a,b in e)/len(e):.3f} (twin target 0.05)")

print("\n4. Robust fix: drop the largest-residual anchor once (n=8 ring), rms error (m)")
A = ring(8)
for p in (0.0, 0.1, 0.2, 0.4):
    e0 = errs(A, (0, 0), p, m, sigma, 400 + int(p * 10))
    e1 = errs(A, (0, 0), p, m, sigma, 400 + int(p * 10), fixer=lambda A_, r: trimmed_fix(A_, r, 1))
    e2 = errs(A, (0, 0), p, m, sigma, 400 + int(p * 10), fixer=lambda A_, r: trimmed_fix(A_, r, 2))
    print(f"   p={p}: LS {rms(e0):.3f}  drop1 {rms(e1):.3f}  drop2 {rms(e2):.3f}   95th pct LS {q(e0,.95):.2f} drop1 {q(e1,.95):.2f}")
