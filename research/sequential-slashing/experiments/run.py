"""Experiments E1-E6.  E1-E4 and E6 are exact (dynamic program over (t, faults) through
the shipped decision rule `stopped`); E5 is Monte Carlo with Wilson 95% intervals."""
import os, sys, math, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); out.append(s)

P, Q, A = 0.2, 0.3, 0.05
p(f"Setup: claimed fault rate p={P}, cheater's true rate q={Q}, alpha={A}, KL(q||p)={kl(Q,P):.5f} nats")
p("E1. false slashing of HONEST verifiers within T=2000 steps (exact)")
z = exact_false_slash("z", P, A, 2000)
lr = exact_false_slash("lr", P, A, 2000, q=Q)
mx = exact_false_slash("mixture", P, A, 2000, K=32)
p(f"  peeking z-test (nominal 0.05): {z:.4f}   LR e-process: {lr:.4f}   mixture e-process (K=32): {mx:.4f}   Ville bound: {A}")
p("E2. detection delay of the cheater (T=3000, exact)")
Pl, ml = exact_detection("lr", P, Q, A, 3000)
Pm, mm = exact_detection("mixture", P, Q, A, 3000, K=32)
w = wald_lower(A, Q, P)
p(f"  oracle LR:  mean {ml:.1f}  detected {Pl:.6f}")
p(f"  mixture:    mean {mm:.1f}  detected {Pm:.6f}")
p(f"  Wald ln(1/alpha)/KL = {w:.1f};  oracle overshoot ratio {ml/w:.3f};  price of not knowing q: x{mm/ml:.3f}")
p("E3. delay scaling with alpha (oracle LR, exact)")
for al in (0.2, 0.05, 0.01, 0.001):
    P_, m = exact_detection("lr", P, Q, al, 3000)
    p(f"  alpha={al}: mean {m:.1f}   Wald {wald_lower(al,Q,P):.1f}   ratio {m/wald_lower(al,Q,P):.3f}   detected {P_:.6f}")
p("E4. delay scaling with effect size (alpha=0.05, oracle LR, exact)")
for q, T in ((0.25, 3000), (0.3, 1500), (0.4, 600), (0.6, 200)):
    P_, m = exact_detection("lr", P, q, A, T)
    p(f"  q={q}: KL={kl(q,P):.4f} mean {m:.1f} Wald {wald_lower(A,q,P):.1f}   ratio {m/wald_lower(A,q,P):.3f}   detected {P_:.6f}")

p("E5. reports that vary by round (Monte Carlo, 2000 trials, Wilson 95% intervals, K=32)")
def mc(make, test, trials=2000, seed=0):
    rng = random.Random(seed); hits = 0; taus = []
    for _ in range(trials):
        ps, ys = make(rng)
        t = test(ys, ps)
        if t is not None: hits += 1; taus.append(t)
    lo, hi = wilson(hits, trials)
    return hits / trials, lo, hi, (sum(taus) / len(taus) if taus else float("nan"))
def fmt(r): return f"{r[0]:.4f} [{r[1]:.4f}, {r[2]:.4f}]" + (f"  mean delay {r[3]:.0f}" if r[0] > 0.5 else "")
# (a) honest verifier whose fault rate shifts: 0.4 for 300 rounds, then 0.1 for 1700 (mean 0.145).
def shift(rng):
    ps = [0.4] * 300 + [0.1] * 1700
    return ps, [1 if rng.random() < x else 0 for x in ps]
pbar = (0.4 * 300 + 0.1 * 1700) / 2000
p(f"  (a) honest, reports 0.4 for 300 rounds then 0.1 for 1700; slashed within 2000 rounds:")
p(f"      constant-p mixture at the average report {pbar:.3f}: {fmt(mc(shift, lambda ys, ps: run_mixture(ys, pbar, A, K=32)))}")
p(f"      per-round mixture (one-sided):              {fmt(mc(shift, lambda ys, ps: run_mixture_varying(ys, ps, A)))}")
p(f"      per-round mixture (two-sided):              {fmt(mc(shift, lambda ys, ps: run_mixture_varying(ys, ps, A, side='two-sided')))}")
# (b) reports drawn i.i.d. uniform on [0.05, 0.35]; cheater's true rate p_t + 0.5 p_t (under-reports by a third).
def iid(rng, mult=1.0, T=3000):
    ps = [0.05 + 0.3 * rng.random() for _ in range(T)]
    return ps, [1 if rng.random() < min(1.0, mult * x) else 0 for x in ps]
p(f"  (b) reports i.i.d. U[0.05, 0.35] (mean 0.2), T=3000:")
p(f"      honest, per-round two-sided:                 {fmt(mc(iid, lambda ys, ps: run_mixture_varying(ys, ps, A, side='two-sided')))}")
p(f"      cheater, true rate 1.5 p_t; constant-p mixture at 0.2: {fmt(mc(lambda r: iid(r, 1.5), lambda ys, ps: run_mixture(ys, 0.2, A, K=32), trials=500))}")
p(f"      cheater, true rate 1.5 p_t; per-round one-sided:       {fmt(mc(lambda r: iid(r, 1.5), lambda ys, ps: run_mixture_varying(ys, ps, A), trials=500))}")
p(f"      cheater, true rate 1.5 p_t; per-round two-sided:       {fmt(mc(lambda r: iid(r, 1.5), lambda ys, ps: run_mixture_varying(ys, ps, A, side='two-sided'), trials=500))}")
p(f"      over-reporter, true rate 0.5 p_t; per-round one-sided: {fmt(mc(lambda r: iid(r, 0.5), lambda ys, ps: run_mixture_varying(ys, ps, A), trials=500))}")
p(f"      over-reporter, true rate 0.5 p_t; per-round two-sided: {fmt(mc(lambda r: iid(r, 0.5), lambda ys, ps: run_mixture_varying(ys, ps, A, side='two-sided'), trials=500))}")

p("E6. sweep over the claimed rate p (cheater q = 1.5p, alpha=0.05, K=32, exact)")
for pp, T in ((0.02, 6000), (0.05, 3000), (0.1, 3000), (0.2, 1500), (0.4, 800)):
    qq = 1.5 * pp
    z_ = exact_false_slash("z", pp, A, T)
    mx_ = exact_false_slash("mixture", pp, A, T, K=32)
    Pl_, ml_ = exact_detection("lr", pp, qq, A, T)
    Pm_, mm_ = exact_detection("mixture", pp, qq, A, T, K=32)
    p(f"  p={pp}: T={T} false-slash z {z_:.3f} mixture {mx_:.4f} | delay LR {ml_:.0f} (Wald {wald_lower(A,qq,pp):.0f}) mixture {mm_:.0f} "
      f"x{mm_/ml_:.2f} | detected by T: LR {Pl_:.4f} mixture {Pm_:.4f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
