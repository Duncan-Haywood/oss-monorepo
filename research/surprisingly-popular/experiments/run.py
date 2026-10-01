import math, random
from surprisingly_popular import *
from surprisingly_popular.model import simulate

pi, s, sp = 0.5, 0.45, 0.95
u, v = cond_flag(pi, s, sp)
th = sp_threshold(pi, s, sp)
print(f"setup: prior faulty {pi}, a faulty job is flagged w.p. sens={s}, a sound job w.p. 1-spec={1-sp:.2f}")
print(f"Bayesian verifier predicts flag fraction u={u:.4f} after flag, v={v:.4f} after no flag; SP threshold theta={th:.4f}\n")

print("E1 exact error vs n (state A = faulty, B = sound; overall at prior 1/2)")
print("   n   majority: A / B / all       SP: A / B / all           Bayes (known params): A / B / all")
for n in (5, 11, 21, 51, 101, 301):
    m = decide_error(n, .5, pi, s, sp); q = decide_error(n, th, pi, s, sp); b = bayes_error(n, pi, s, sp)
    print(f" {n:4d}  {m[0]:.4f} {m[1]:.1e} {m[2]:.4f}    {q[0]:.2e} {q[1]:.1e} {q[2]:.2e}    {b[0]:.2e} {b[1]:.1e} {(b[0]+b[1])/2:.2e}")

print("\nE2 votes needed for overall error <= 1e-3 (prior 1/2)")
def need(f, tgt=1e-3):
    for n in range(1, 2000):
        if f(n) <= tgt:
            return n
print(" SP:", need(lambda n: decide_error(n, th, pi, s, sp)[2]),
      " Bayes:", need(lambda n: (lambda b: (b[0] + b[1]) / 2)(bayes_error(n, pi, s, sp))),
      " majority: never (error -> prior mass of A =", pi, ")")

print("\nE3 limit correctness region: SP right iff 1-spec < theta < sens; scan of 99k common-prior draws with sens+spec>1")
rng = random.Random(0); tot = bad = 0
for _ in range(200000):
    p_, a_, b_ = rng.uniform(.01, .99), rng.uniform(.01, .99), rng.uniform(.01, .99)
    if a_ + b_ > 1.001:
        tot += 1; bad += not sp_correct_in_limit(p_, a_, b_)
print(f" violations: {bad} of {tot}")
print(" majority right in the limit iff sens>1/2 and spec>1/2; share of the same draws:", end=" ")
rng = random.Random(0); tot = ok = 0
for _ in range(200000):
    p_, a_, b_ = rng.uniform(.01, .99), rng.uniform(.01, .99), rng.uniform(.01, .99)
    if a_ + b_ > 1.001:
        tot += 1; ok += (a_ > .5 and b_ > .5)
print(f"{ok/tot:.3f}")

print("\nE4 prior misspecification: verifiers believe faulty-prior pi_b, truth 0.5 (n->infinity correctness, then n=101 error)")
print("  pi_b    theta     right in limit?   n=101 error in A   error in B")
for pb in (0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99):
    t = sp_threshold(pb, s, sp)
    print(f"  {pb:<6} {t:.4f}   {str(sp_correct_in_limit(pi, s, sp, believed=(pb, s, sp))):<16} {error_at_threshold(101, t, s, sp, 'A'):.3e}       {error_at_threshold(101, t, s, sp, 'B'):.3e}")
lo = hi = None
for k in range(1, 1000):
    pb = k / 1000
    ok = sp_correct_in_limit(pi, s, sp, believed=(pb, s, sp))
    if ok and lo is None: lo = pb
    if ok: hi = pb
print(f" believed prior in [{lo}, {hi}] keeps SP right in the limit (true model theta is {th:.3f} at pi_b=0.5)")

print("\nE4b believed detector quality (sens_b, spec_b) wrong; truth sens=0.45, spec=0.95, prior 0.5")
print("  believed (sens_b,spec_b)   theta    right in limit?  (needs 0.05 < theta < 0.45)")
for sb, pb in ((0.45, 0.95), (0.6, 0.95), (0.9, 0.5), (0.9, 0.9), (0.99, 0.6), (0.3, 0.95), (0.55, 0.55)):
    t = sp_threshold(pi, sb, pb)
    print(f"  ({sb}, {pb})              {t:.4f}   {sp_correct_in_limit(pi, s, sp, believed=(pi, sb, pb))}")

print("\nE5 Byzantine verifiers vote 'no flag' and predict flag-fraction 1 (n=2000, 60 runs, state A)")
rb = byzantine_breakdown(pi, s, sp)
print(f" closed-form breakdown rho* = {rb:.4f}")
rng = random.Random(5)
print("  rho     SP says A    SP trimmed(=rho) says A")
for rho in (0.0, 0.05, 0.10, 0.13, 0.15, 0.20, 0.30):
    r1 = sum(simulate(2000, pi, s, sp, "A", rng, rho=rho) for _ in range(60)) / 60
    r2 = sum(simulate(2000, pi, s, sp, "A", rng, rho=rho, trim=rho) for _ in range(60)) / 60
    print(f"  {rho:<6} {r1:.2f}         {r2:.2f}")
