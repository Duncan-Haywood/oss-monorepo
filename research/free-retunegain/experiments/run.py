"""Retuning on the interval law vs the fixed-period twin gain. Stdlib only, seed 7."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import retune as R

A, H0 = 3.0, 0.5
OUT = []


def p(s=""):
    print(s)
    OUT.append(s)


p(f"plant x' = {A} x, nominal interval h0 = {H0}; kappa = k/a, g(h) = e^(a h) - kappa (e^(a h) - 1)")
p()
p("Missed samples (h = h0 w.p. 1-q, 2 h0 w.p. q): largest q with E g^2 < 1")
p("twin rho0 | q_ms with twin gain | q_ms with ms-retuned gain | retuned g(h0) at that q")
qmax_retune = R.largest(lambda q: R.ms(A, R.kappa_ms(A, *R.miss_law(H0, q)), *R.miss_law(H0, q)) < 1, 0.0, 1.0)
for rho in (0.0, 0.3, 0.5, 0.7):
    kt = R.kappa_twin(A, H0, rho)
    qt = R.largest(lambda q: R.ms(A, kt, *R.miss_law(H0, q)) < 1, 0.0, 1.0)
    kr = R.kappa_ms(A, *R.miss_law(H0, qmax_retune))
    p(f"{rho:6.1f}     | {qt:18.3f}   | {qmax_retune:25.3f}  | {R.g(A, kr, H0):+.3f}")
p()
p("Gains at fixed miss probability q (twin gain: rho0 = 0.5)")
p("q      kappa_twin  Eg2_twin   kappa_ms  Eg2_ms   g(h0)_ms  g(2h0)_ms  kappa_as  Elng_as  Elng_twin")
for q in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6):
    n, w = R.miss_law(H0, q)
    kt, km = R.kappa_twin(A, H0, 0.5), R.kappa_ms(A, n, w)
    ka = R.kappa_as(A, n, w)
    p(f"{q:.1f}   {kt:9.4f} {R.ms(A, kt, n, w):9.4f}  {km:9.4f} {R.ms(A, km, n, w):8.4f}  {R.g(A, km, H0):+8.4f}  {R.g(A, km, 2*H0):+8.4f}  "
      f"{ka:8.4f} {R.lyap(A, ka, n, w):8.4f}  {R.lyap(A, kt, n, w):8.4f}")
p()
p("Uniform jitter h ~ U[h0(1-j), h0(1+j)]: E g^2 at j = 0.999 (widest allowed)")
p("twin rho0 | Eg2 twin gain | Eg2 ms-retuned | kappa_twin | kappa_ms | retuned g(h0)")
nodes, wts = R.uniform_law(H0, 0.999, 4001)
for rho in (0.0, 0.3, 0.5):
    kt = R.kappa_twin(A, H0, rho)
    km = R.kappa_ms(A, nodes, wts)
    p(f"{rho:6.1f}     | {R.ms(A, kt, nodes, wts):13.4f} | {R.ms(A, km, nodes, wts):14.4f} | {kt:9.4f}  | {km:8.4f} | {R.g(A, km, H0):+.4f}")
p()
p("Monte Carlo: 2000 runs x 300 samples, miss law, blow = |x| > 1e6 |x0|")
p("q    gain               E g^2    E ln|g|   blow-up frac   median log-rate/step")
rng = random.Random(7)
def sim(kappa, q):
    bad, rates = 0, []
    for _ in range(2000):
        lx = 0.0
        for _ in range(300):
            h = 2 * H0 if rng.random() < q else H0
            lx += math.log(abs(R.g(A, kappa, h)) + 1e-300)
            if lx > math.log(1e6):
                break
        bad += lx > math.log(1e6)
        rates.append(lx / 300)
    rates.sort()
    return bad / 2000, rates[1000]
for q in (0.4, 0.6, 0.8):
    n, w = R.miss_law(H0, q)
    for name, kap in (("twin rho0=0.5", R.kappa_twin(A, H0, 0.5)), ("ms-retuned", R.kappa_ms(A, n, w)), ("as-retuned", R.kappa_as(A, n, w))):
        f, m = sim(kap, q)
        p(f"{q:.1f}  {name:14s}  {R.ms(A, kap, n, w):8.4f} {R.lyap(A, kap, n, w):8.4f}   {f:12.4f}   {m:10.4f}")
p()
p("Misspecified law: ms-gain designed for q_design, evaluated at the true q (E g^2; < 1 is mean-square stable). 'twin' = rho0 0.5 gain")
qs = (0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0)
p("q_design \\ true q  " + "".join(f"{q:8.1f}" for q in qs))
for qd in (0.1, 0.3, 0.5, 0.9):
    kd = R.kappa_ms(A, *R.miss_law(H0, qd))
    p(f"{qd:14.1f}   " + "".join(f"{R.ms(A, kd, *R.miss_law(H0, q)):8.3f}" for q in qs))
kt = R.kappa_twin(A, H0, 0.5)
p(f"{'twin':>14s}   " + "".join(f"{R.ms(A, kt, *R.miss_law(H0, q)):8.3f}" for q in qs))
worst = max(R.ms(A, R.kappa_ms(A, *R.miss_law(H0, q)), *R.miss_law(H0, q)) for q in [i / 1000 for i in range(1001)])
p(f"worst case over true q = design q of the retuned E g^2: {worst:.4f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(OUT) + "\n")
