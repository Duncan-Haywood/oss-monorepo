"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random, statistics as st
from twin_evaluation import *

MU, S, SE = 1.0, 1.0, 1.0          # context sd, execution sd: sigma_R^2 = 2, context share eta = 0.5
SR = math.sqrt(S * S + SE * SE)


def run(n, N, reps, seed, b=0.0, g=1.0, tau=1.0, mu=MU, s=S, se=SE, lam=None):
    rng = random.Random(seed)
    out = []
    for _ in range(reps):
        R, T = sample_pairs(n, mu, s, se, b, g, tau, rng)
        ex = sample_twin(N - n, mu, s, b, g, tau, rng)
        out.append(cv_estimate(R, T, ex, lam))
    return out


print("== E1  bias: twin-only vs real-only vs control variate (n=30 real, N=3000 twin, twin bias b=+0.7, true mean 1.0)")
b = 0.7
rng = random.Random(1)
tw = [sum(sample_twin(3000, MU, S, b, 1.0, 1.0, rng)) / 3000 for _ in range(1000)]
ro = []
rng = random.Random(2)
for _ in range(2000):
    R, _ = sample_pairs(30, MU, S, SE, b, 1.0, 1.0, rng)
    ro.append(sum(R) / 30)
cv = run(30, 3000, 2000, 3, b=b)
for name, xs in (("twin-only", tw), ("real-only", ro), ("control variate", cv)):
    print(f"  {name:16s} mean error {st.mean(xs) - MU:+.3f}   sd {st.stdev(xs):.3f}")

print("\n== E2  what sets the correlation: twin execution noise tau (context share eta = 0.5, g = 1)")
print("  tau   rho   rho^2  var ratio vs real-only (N->inf): formula 1-rho^2 | simulated (n=50, N=5000, plug-in lambda)")
base = SR * SR / 50
for tau in (2.0, 1.0, 0.5, 0.0):
    sR, sT, cov, rho = moments(S, SE, 1.0, tau)
    v = st.variance(run(50, 5000, 4000, 10, tau=tau))
    print(f"  {tau:3.1f}  {rho:.3f} {rho*rho:.3f}   {1 - rho*rho:.3f} | {v / base:.3f}")
print("  context share eta -> rho of faithful twin (tau=se) vs noise-free twin (tau=0):")
for se in (2.0, 1.0, 0.5):
    eta = S * S / (S * S + se * se)
    _, _, _, rf = moments(S, se, 1.0, se)
    _, _, _, r0 = moments(S, se, 1.0, 0.0)
    print(f"  eta={eta:.2f}: faithful rho={rf:.3f} (equiv. real-sample gain {1/(1-rf**2):.2f}x)   noise-free rho={r0:.3f} ({1/(1-r0**2):.2f}x)")

print("\n== E3  cost of estimating lambda from n pairs (noise-free twin, rho=0.707, N=20n): variance vs optimal fixed lambda, and 95% interval coverage")
sR, sT, cov, rho = moments(S, SE, 1.0, 0.0)
for n in (6, 10, 20, 50):
    N = 20 * n
    reps = 4000
    est = run(n, N, reps, 20 + n, tau=0.0)
    opt = var_cv(sR, rho, n, N)
    rng = random.Random(30 + n)
    hit = 0
    for _ in range(reps):
        R, T = sample_pairs(n, MU, S, SE, 0.0, 1.0, 0.0, rng)
        ex = sample_twin(N - n, MU, S, 0.0, 1.0, 0.0, rng)
        lo, hi = cv_interval(R, T, ex)
        hit += lo <= MU <= hi
    print(f"  n={n:3d}: var/optimal {st.variance(est) / opt:.3f}   (n-2)/(n-3)={(n - 2) / (n - 3):.3f}   coverage {hit / reps:.3f}")

print("\n== E4  cost-optimal allocation, budget C=1000 (real rollout cost 1); sigma_R^2=2")
for name, tau in (("faithful (rho=0.5)", 1.0), ("noise-free (rho=0.707)", 0.0)):
    sR, sT, cov, rho = moments(S, SE, 1.0, tau)
    print(f"  {name}: worth-it threshold c_T/c_R < {worth_threshold(rho):.3f}")
    for w in (0.001, 0.01, 0.05, 0.1, 0.5):
        n, N, V = optimal_alloc(1000.0, 1.0, w, sR, rho)
        if N == 0:
            print(f"    c_T/c_R={w:<5}: twin not worth it; real-only n={n:.0f}, var {V:.5f}")
            continue
        ni, Ni = round(n), round((1000.0 - round(n)) / w)
        sim = st.variance(run(ni, Ni, 600, 40, tau=tau)) if Ni <= 20000 else float("nan")
        print(f"    c_T/c_R={w:<5}: n*={n:6.1f} N*={N:8.0f}  var {V:.5f} ({V / (sR**2 / 1000):.3f}x real-only)  simulated at rounded ({ni},{Ni}): {sim:.5f}")

print("\n== E5  ranking two policies: twin favours the wrong one (true gap A-B = +0.20; twin bias b_A=0, b_B=+0.40 so twin gap = -0.20)")
D, bA, bB = 0.20, 0.0, 0.40
for name, tau in (("faithful", 1.0), ("noise-free", 0.0)):
    sR, sT, cov, rho = moments(S, SE, 1.0, tau)
    print(f"  {name} twin (rho={rho:.3f}); twin-only picks A with prob ~0 as N grows (twin gap {D - (bB - bA):+.2f}); real-only vs control variate, N=20n:")
    for n in (20, 50, 100, 200):
        p_real = Phi(-D / math.sqrt(2 * SR * SR / n))
        p_cv = Phi(-D / math.sqrt(2 * var_cv(sR, rho, n, 20 * n)))
        # simulate
        rng = random.Random(50 + n)
        wr = wc = 0
        reps = 1500
        for _ in range(reps):
            RA, TA = sample_pairs(n, MU + D, S, SE, bA, 1.0, tau, rng)
            RB, TB = sample_pairs(n, MU, S, SE, bB, 1.0, tau, rng)
            exA = sample_twin(19 * n, MU + D, S, bA, 1.0, tau, rng)
            exB = sample_twin(19 * n, MU, S, bB, 1.0, tau, rng)
            wr += (sum(RA) - sum(RB)) / n <= 0
            wc += cv_estimate(RA, TA, exA) - cv_estimate(RB, TB, exB) <= 0
        print(f"    n={n:3d}: P(wrong) real-only {p_real:.3f} (sim {wr / reps:.3f})   control variate {p_cv:.3f} (sim {wc / reps:.3f})")
    z = Phi_inv(0.9)
    n_real = 2 * (z * SR / D) ** 2
    n_cv = 2 * (z * SR / D) ** 2 * (1 - rho * rho + rho * rho / 20)
    print(f"    real episodes per policy for 90% correct order: real-only {n_real:.0f}, control variate {n_cv:.0f}")

print("\n== E6  binary success (latent difficulty u shared; R=1[u+0.8e<0.3], T=1[u+0.8e'<0.0]; twin is pessimistic)")
rng = random.Random(7)
def draw(k):
    out = []
    for _ in range(k):
        u = rng.gauss(0, 1)
        out.append((float(u + 0.8 * rng.gauss(0, 1) < 0.3), float(u + 0.8 * rng.gauss(0, 1) < 0.0), u))
    return out
big = draw(400000)
pR = sum(x[0] for x in big) / len(big); pT = sum(x[1] for x in big) / len(big)
cvv = sum((x[0] - pR) * (x[1] - pT) for x in big) / len(big)
sR, sT = math.sqrt(pR * (1 - pR)), math.sqrt(pT * (1 - pT))
rho = cvv / (sR * sT)
lam = cvv / (sT * sT)
print(f"  real success {pR:.3f}, twin success {pT:.3f} (bias {pT - pR:+.3f}); rho={rho:.3f}; formula variance ratio 1-rho^2 = {1 - rho * rho:.3f}")
n, N, reps = 50, 2000, 1500
ests = []
for _ in range(reps):
    R = []; T = []
    for _ in range(n):
        u = rng.gauss(0, 1)
        R.append(float(u + 0.8 * rng.gauss(0, 1) < 0.3)); T.append(float(u + 0.8 * rng.gauss(0, 1) < 0.0))
    ex = [float(rng.gauss(0, 1) + 0.8 * rng.gauss(0, 1) < 0.0) for _ in range(N - n)]
    ests.append(cv_estimate(R, T, ex, lam))
print(f"  n={n}, N={N}: mean {st.mean(ests):.4f} (truth {pR:.4f}); var {st.variance(ests):.6f} vs formula {var_cv(sR, rho, n, N):.6f}; real-only {pR * (1 - pR) / n:.6f}")
