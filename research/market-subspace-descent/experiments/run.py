import sys, os, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from market_subspace_descent import *

d = 5
print("1. Correlated securities slow single-security traders (uniform coordinate traders, unit-diagonal Hessian, d=5)")
print("   c     bound 1-(1-c)/d   exact rate (power iter)   closed form    rounds to 1e-3 (exact)   conjugate-bundle rate 1-1/d")
subs, pr = coordinate_subspaces(d)
for c in [0.0, 0.5, 0.8, 0.9, 0.95]:
    A = equicorrelated(d, c)
    b = 1 - rate_bound(A, subs, pr)
    ex = asymptotic_rate(A, subs, pr, iters=6000)
    cf = equicorrelated_rate(d, c)
    n = math.log(1e-3) / math.log(cf)
    cs, cp = conjugate_subspaces(A)
    cr = asymptotic_rate(A, cs, cp, iters=300)
    print(f"  {c:4.2f}   {b:.4f}            {ex:.4f}                  {cf:.4f}         {n:8.1f}                 {cr:.4f}  (bound {1-rate_bound(A,cs,cp):.4f})")

print("\n2. Exact second-moment curve vs Monte Carlo (c=0.5, d=5, e0=(1,-1,2,0,1))")
A = equicorrelated(d, 0.5); e0 = [1, -1, 2, 0, 1]
ex = second_moment_curve(A, e0, subs, pr, 30)
mc = simulate(A, e0, subs, pr, 30, runs=20000, seed=3)
for t in [0, 5, 10, 20, 30]:
    print(f"  t={t:2d}  exact E||e||_A^2={ex[t]:.5f}   MC={mc[t]:.5f}")

print("\n3. Market maker's loss telescopes (explicit cost function, one random run, c=0.5, noisy beliefs sigma=0.3, kappa=0.7)")
rng = random.Random(7)
Ps = [projector(A, U) for U in subs]
e = list(e0); loss = 0.0; q = list(e0)  # q* = 0 so q = e
for t in range(200):
    P = Ps[rng.randrange(d)]
    xi = [rng.gauss(0, 0.3) for _ in range(d)]
    q2 = [q[i] - 0.7 * sum(P[i][j] * (q[j] - xi[j]) for j in range(d)) for i in range(d)]
    loss += trade_profit(A, q, q2, [0.0] * d)
    q = q2
print(f"  sum of trader profits (maker's expected loss) = {loss:.6f};  (e0'Ae0 - eT'AeT)/2 = {(anorm2(A,e0)-anorm2(A,q))/2:.6f}; cap e0'Ae0/2 = {anorm2(A,e0)/2:.4f}")

print("\n4. Noisy beliefs: step size kappa trades speed for floor (A=I, d=5, sigma=1, e0=2 per coordinate)")
print("   kappa   stationary floor d k s^2/(2-k)   per-round rate 1-k(2-k)/d   E||e_T||^2 at T=20 / 100 / 1000 (exact)")
S = [[1.0 if i == j else 0.0 for j in range(d)] for i in range(d)]
I5 = S
e0i = [2.0] * d
for k in [1.0, 0.5, 0.2, 0.05]:
    fl, rt = noise_floor_diag(d, k, 1.0)
    cur = second_moment_curve(I5, e0i, subs, pr, 1000, kappa=k, S=I5)
    print(f"  {k:5.2f}   {fl:8.4f}                        {rt:.4f}                     {cur[20]:.3f} / {cur[100]:.3f} / {cur[1000]:.3f}")
print("   best constant kappa by horizon (sigma=1, e0^2=4 per coordinate) vs running-mean step 1/(n+1) vs kappa=1:")
for T in [10, 30, 100, 1000]:
    kb, eb = best_constant_kappa(d, 1.0, 4.0, T)
    print(f"  T={T:5d}: best kappa={kb:.3f} error={eb:.3f};  running-mean error={averaging_error(d, 1.0, 4.0, T):.3f};  kappa=1 error={noise_floor_diag(d,1.0,1.0)[0]:.3f} (5 x 1)")

print("\n5. Real LMSR (softmax, 4 outcomes, theta=(.5,.25,.15,.10)), traders minimise KL(theta||p) over their bundle; local Hessian A=diag(theta)-theta theta'")
th = [0.5, 0.25, 0.15, 0.10]
dd = 3
Al = [[(th[i] if i == j else 0.0) - th[i] * th[j] for j in range(dd)] for i in range(dd)]
cs_, cp_ = coordinate_subspaces(dd)
pair = [[[1.0], [1.0], [0.0]], [[0.0], [1.0], [1.0]], [[1.0], [0.0], [1.0]]]  # bundles: outcomes {1,2}, {2,3}, {1,3}
pair = [[[1.0 if i in s else 0.0] for i in range(dd)] for s in [(0, 1), (1, 2), (0, 2)]]
cj, cjp = conjugate_subspaces(Al)
for name, sb, pb in [("single-outcome traders", cs_, cp_), ("pair-bundle traders", pair, [1/3] * 3), ("A-conjugate bundles", cj, cjp)]:
    kl = lmsr_run(th, sb, pb, 90, runs=3000, seed=5)
    xs = [(t, kl[t]) for t in range(91) if 1e-8 < kl[t] < 1e-3]   # late regime, above float noise and Monte Carlo rare-event noise
    slope = math.exp((math.log(xs[-1][1]) - math.log(xs[0][1])) / (xs[-1][0] - xs[0][0]))
    print(f"  {name:24s} KL(t=0)={kl[0]:.4f} KL(10)={kl[10]:.2e} KL(25)={kl[25]:.2e} (fit window t={xs[0][0]}..{xs[-1][0]})  measured rate {slope:.3f}   predicted exact {asymptotic_rate(Al, sb, pb, iters=3000):.3f}  bound {1-rate_bound(Al, sb, pb):.3f}")
