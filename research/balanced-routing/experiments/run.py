import math, random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from balanced_routing import *

N = 8; MEANS = [0.9, 0.6, 0.4, 0.2, 0.0, -0.2, -0.4, -0.6]

print("E1 exact price of balance (soft routing, B=400, N=8, capacity c = 1.25/N):  tau, utility unconstrained, constrained, loss%, max price, AGD iters")
S = gaussian_scores(400, N, random.Random(1), MEANS)
c = [1.25 / N] * N
for tau in (1.0, 0.5, 0.25, 0.1):
    p0 = [0.0] * N
    X0 = assign(S, p0, tau); u0 = primal_value(S, X0, tau)
    p, k = solve_dual(S, tau, c, iters=200000, tol=1e-7)
    X = assign(S, p, tau); u1 = primal_value(S, X, tau)
    lo, up, gap = certificate(S, p, tau, c)
    print(f"  {tau:5.2f} {u0:9.2f} {u1:9.2f} {100*(u0-u1)/u0:6.2f}%  pmax {max(p):.3f}  iters {k:6d}  cert gap {gap:.2e}")

print("E2 certificate gap of a sloppy solver (tau=0.5, c=0.2): gap after k dual steps vs true suboptimality")
tau = 0.5; c2 = [0.2] * N
popt, _ = solve_dual(S, tau, c2, iters=200000, tol=1e-9)
Dopt = dual(S, popt, tau, c2)
p = [0.0] * N; step = 2 * tau / len(S)
for k in range(1, 2001):
    g = dual_grad(S, p, tau, c2)
    p = [max(0.0, a - step * b) for a, b in zip(p, g)]
    if k in (1, 10, 100, 1000, 2000):
        lo, up, gap = certificate(S, p, tau, c2)
        print(f"  k={k:5d}  D-D*={up-Dopt:10.4f}  certified gap={gap:10.4f}  (gap >= D-D*: {gap >= up-Dopt-1e-9})")

print("E3 sign-update balancing (aux-loss-free), tau=0.5, c=1/N: mean |load error| over last half vs gamma and batch size B")
c = [1.0 / N] * N
for B in (64, 256, 1024, 4096):
    row = []
    for gamma in (0.1, 0.03, 0.01, 0.003):
        samp = lambda r, B=B: gaussian_scores(B, N, r, MEANS)
        _, errs = sign_update(samp, N, c, gamma, 0.5, 1200, random.Random(7))
        row.append(sum(abs(e) for e in errs[600:]) / 600)
    print(f"  B={B:5d}  " + "  ".join(f"g={g}: {100*e:5.2f}%" for g, e in zip((0.1, 0.03, 0.01, 0.003), row)) + f"   1/sqrt(B)={100/math.sqrt(B):.2f}%")

print("E4 convergence of sign update on a FIXED batch (B=400): price drift and imbalance vs gamma, and steps to first reach 5% imbalance")
S = gaussian_scores(400, N, random.Random(1), MEANS)
for gamma in (0.2, 0.05, 0.01):
    p = [0.0] * N; first = None; tail = []
    for k in range(3000):
        L = loads(assign(S, p, 0.5))
        e = max(li / (400 / N) for li in L) - 1
        if first is None and e < 0.05: first = k
        if k >= 2000: tail.append(e)
        p = [pi + gamma * (1 if li > 400 / N else -1) for pi, li in zip(p, L)]
    print(f"  gamma={gamma:5.2f}  steps to 5%: {first}  tail max-overload mean {100*sum(tail)/len(tail):5.2f}%  worst {100*max(tail):5.2f}%")

print("E5 two-expert Gaussian closed form: hard-routing utility loss of forcing balance (q=1/2), sigma=1")
for mu in (0.0, 0.25, 0.5, 1.0, 2.0):
    loss, t = gauss_balance_loss(mu, 1.0)
    rng = random.Random(0); ds = [rng.gauss(mu, 1) for _ in range(200000)]
    mc = sum(d for d in ds if d > 0) / 2e5 - sum(d for d in ds if d > t) / 2e5
    print(f"  mu={mu:4.2f}  loss={loss:.4f} (MC {mc:.4f})  price shift t={t:.3f}  frac to expert 1 unconstrained={0.5*(1+math.erf(mu/math.sqrt(2))):.3f}")

print("E6 verifier audit: tokens needed and empirical coverage (eps=0.02 load-fraction, delta=0.05, N=8)")
S = gaussian_scores(20000, N, random.Random(11), MEANS); p, _ = solve_dual(gaussian_scores(400, N, random.Random(1), MEANS), 0.5, [1.25 / N] * N, 200000, 1e-8)
X = assign(S, p, 0.5); true = [l / 20000 for l in loads(X)]
m = audit_samples(N, 0.02, 0.05); rng = random.Random(3); bad = 0; trials = 400; worst = 0
for _ in range(trials):
    idx = [rng.randrange(20000) for _ in range(m)]
    est = [sum(X[k][i] for k in idx) / m for i in range(N)]
    d = max(abs(a - b) for a, b in zip(est, true)); worst = max(worst, d); bad += d > 0.02
print(f"  m={m}  violations {bad}/{trials}  worst deviation {worst:.4f}")
# cheating: claimed prices with overloaded expert-0 price shaved
pc = p[:]; pc[0] = max(0.0, pc[0] - 0.3)
Lc = [l / 20000 for l in loads(assign(S, pc, 0.5))]; Lt = [l / 20000 for l in loads(X)]
print(f"  shaved price on expert 0: true load {Lt[0]:.3f} vs cheated {Lc[0]:.3f} (cap {1.25/N:.3f}); detectable with m>= {audit_samples(N, (Lc[0]-1.25/N)/2, 0.05)} samples")
