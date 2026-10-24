"""Jitter margins for a sampled-data loop tuned on a fixed-period twin. Stdlib only, seed 7."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import jitter as J

A, H0 = 3.0, 0.5
OUT = []


def p(s=""):
    print(s)
    OUT.append(s)


p(f"plant x' = {A} x, nominal interval h0 = {H0}; twin contraction rho0 = g(h0)")
p()
p("Uniform jitter h ~ U[h0(1-j), h0(1+j)]: largest j that is stable (exact quadrature, 4001 nodes)")
p("rho0  gain k   j_as(E ln|g|<0)  j_ms(E g^2<1)  as/ms")
for rho in (0.0, 0.3, 0.5, 0.7, 0.9):
    k = J.gain_for(A, H0, rho)
    las = lambda j: J.moments(A, k, J.uniform_nodes(H0, j, 4001))[0] < 0
    lms = lambda j: J.moments(A, k, J.uniform_nodes(H0, j, 4001))[1] < 1
    jas = J.threshold(las, 0.0, 0.999) if rho else None
    jms = J.threshold(lms, 0.0, 0.999) if rho else None
    if rho == 0.0:  # fixed point 0 is not a threshold search: report scan
        jas = max((j / 1000 for j in range(0, 1000) if las(j / 1000)), default=0.0)
        jms = max((j / 1000 for j in range(0, 1000) if lms(j / 1000)), default=0.0)
    p(f"{rho:4.1f}  {k:6.3f}   {jas:14.3f}  {jms:13.3f}  {jas/jms if jms else float('nan'):6.2f}")
p()
p("Missed samples: h = h0 w.p. 1-q, 2*h0 w.p. q: largest q that is stable")
p("rho0  q_as    q_ms")
for rho in (0.0, 0.3, 0.5, 0.7, 0.9):
    k = J.gain_for(A, H0, rho)
    def ok(q, idx):
        n, w = J.drop_law(H0, q)
        lyap, m2 = J.moments(A, k, n, w)
        return (lyap < 0) if idx == 0 else (m2 < 1)
    qa = J.threshold(lambda q: ok(q, 0), 0.0, 1.0)
    qm = J.threshold(lambda q: ok(q, 1), 0.0, 1.0)
    p(f"{rho:4.1f}  {qa:6.3f}  {qm:6.3f}")
p()
p("Monte Carlo check at rho0 = 0.5, missed-sample law: 2000 runs x 300 samples; blow = |x| > 1e6 |x0|")
p("q     E ln|g|   E g^2    MC median rate   MC blow-up frac   verdict")
rng = random.Random(7)
k = J.gain_for(A, H0, 0.5)
for q in (0.1, 0.2, 0.4, 0.5, 0.6, 0.8):
    n, w = J.drop_law(H0, q)
    lyap, m2 = J.moments(A, k, n, w)
    frac, med = J.simulate(A, k, lambda r, q=q: 2 * H0 if r.random() < q else H0, 300, 2000, rng)
    verdict = "ms-stable" if m2 < 1 else ("a.s.-stable only" if lyap < 0 else "unstable")
    p(f"{q:.1f}  {lyap:8.4f} {m2:8.4f}  {med:14.4f}  {frac:15.4f}   {verdict}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(OUT) + "\n")
