"""All numbers quoted in README.md / paper/whitepaper.md.  Seeded; pure Python."""
import math, random
from control_twin import *

A, B, Q, R, W = 0.9, 1.0, 1.0, 0.1, 1.0
Kopt = lqr_gain(A, B, Q, R)
print(f"real plant a={A}, b={B}, q={Q}, r={R}, W={W}: optimal gain {Kopt:.4f}, optimal cost {opt_cost(A,B,Q,R,W):.4f}")

print("\n== E1  twin actuator ratio m=bt/b (at=a): twin gain, claim, real cost, regret, closed-loop pole")
print("  m       Kt      claim    real cost   claim/real   regret     pole a-bKt")
for m in (0.2, 0.3, 0.4, 0.45, 0.5, 0.7, 1, 1.5, 2, 4, 10, 100):
    Kt = lqr_gain(A, m * B, Q, R)
    cl = twin_claim(A, m * B, Q, R, W)
    real = cost(Kt, A, B, Q, R, W)
    print(f"  {m:<7} {Kt:.4f}  {cl:.4f}   {real:9.4f}   {cl/real:9.4f}   {real/opt_cost(A,B,Q,R,W)-1:9.4f}  {A-B*Kt:+.4f}")

print("\n== E2  unstable band of the twin ratio m = bt/b (real loop diverges for m inside the band), by real a and r")
print("  a     r        unstable bands (m_lo, m_hi)      a/(a+1)")
for a in (0.5, 0.9, 1.0, 1.2, 1.5):
    for r in (1e-8, 0.1, 1.0):
        bands = unstable_bands(a, B, Q, r)
        print(f"  {a:<5} {r:<8} {[(float('%.4g' % x), float('%.4g' % y)) for x, y in bands]!s:<32} {a/(a+1):.4f}")

print("\n== E3  asymmetry: regret for twin actuator factor-f too weak (m=1/f) vs too strong (m=f), a=0.9, r=0.1")
for f in (1.5, 2, 3, 10, 100):
    lo, hi = regret(A, B, Q, R, W, A, B / f), regret(A, B, Q, R, W, A, B * f)
    print(f"  f={f:<5} weak twin regret {lo:.4f}   strong twin regret {hi:.4f}")

print("\n== E4  simulation check of the exact cost (400,000 steps)")
rng = random.Random(0)
for m in (0.7, 2.0):
    Kt = lqr_gain(A, m * B, Q, R)
    print(f"  m={m}: exact {cost(Kt,A,B,Q,R,W):.4f}  simulated {simulate_cost(Kt,A,B,Q,R,W,400000,rng):.4f}")

print("\n== E5  closed-loop identifiability: dither std d vs asymptotic std of b_hat and a_hat (n=1000), K=Kopt")
print("  d      sd(b_hat)  sd(a_hat)  corr(a,b)")
for d in (0.0, 0.05, 0.1, 0.3, 1.0):
    ic = info_cov(Kopt, A, B, W, d, 1000)
    if ic == math.inf:
        print(f"  {d:<6} inf        inf        (only a-bK = {A-B*Kopt:.4f} identified)")
    else:
        (va, cab), (_, vb) = ic
        print(f"  {d:<6} {math.sqrt(vb):.4f}     {math.sqrt(va):.4f}     {cab/math.sqrt(va*vb):+.4f}")
print(f"  no dither, simulated: identify() -> {identify(Kopt,A,B,W,0.0,1000,random.Random(1))}")

print("\n== E6  retune from a wrong twin: run twin gain with dither d for n steps, LS-identify (a,b), redesign. 300 reps")
for m in (0.5, 2.0):
    Kt = lqr_gain(A, m * B, Q, R)
    print(f"  twin m={m}: start regret {regret(A,B,Q,R,W,A,m*B):.4f}")
    print("   d     n      mean regret  median    predicted(delta)  regret*n   unstable/failed")
    for d in (0.3, 1.0):
        for n in (100, 400, 1600, 6400):
            rng = random.Random(1000 * n + int(10 * d) + int(10 * m))
            rs, bad = [], 0
            for _ in range(300):
                e = identify(Kt, A, B, W, d, n, rng)
                if e is None or e[1] <= 0.05:
                    bad += 1; continue
                rg = ce_regret(A, B, Q, R, W, *e)
                if rg == math.inf:
                    bad += 1; continue
                rs.append(rg)
            rs.sort()
            mean = sum(rs) / len(rs)
            pred = predicted_regret(Kt, A, B, Q, R, W, d, n)
            print(f"   {d:<5} {n:<6} {mean:.5f}     {rs[len(rs)//2]:.5f}   {pred:.5f}          {mean*n:.3f}     {bad}/300")

print("\n== E7  price of dither: exact extra cost per step while collecting data at gain Kt (m=0.5 twin) vs d")
Kt = lqr_gain(A, 0.5 * B, Q, R)
base = cost(Kt, A, B, Q, R, W)
for d in (0.0, 0.1, 0.3, 1.0):
    print(f"  d={d:<4} cost/step {dither_cost(Kt,A,B,Q,R,W,d):.4f}   excess over d=0 {dither_cost(Kt,A,B,Q,R,W,d)-base:.4f}")

print("\n== E8  total excess cost over horizon H after n collection steps: n*(collect excess) + H*regret*J*, by d (m=0.5, H=50,000)")
H = 50000
Js = opt_cost(A, B, Q, R, W)
print("  n      d      collect   deploy   total   (delta-method regret)")
for n in (400, 1600):
    best = None
    for d in (0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2):
        coll = n * (dither_cost(Kt, A, B, Q, R, W, d) - Js)
        dep = H * Js * predicted_regret(Kt, A, B, Q, R, W, d, n)
        tot = coll + dep
        best = min(best, (tot, d)) if best else (tot, d)
        print(f"  {n:<6} {d:<5} {coll:9.1f} {dep:9.1f} {tot:9.1f}")
    print(f"   best d at n={n}: {best[1]}")
