"""Missed-sample margins of a pendulum loop: fixed twin-tuned gain vs interval-aware gain.
Sweep of w*h0 (how unstable the plant is per sample) and closed-loop pole. Seed 7."""
import os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pendmiss as P

OUT = []
def p(s=""):
    print(s); OUT.append(s)

STEPS = 40000
W2 = P.omega2(0.5)  # 0.5 m pendulum, g = 9.80665
W = W2 ** 0.5
p(f"pendulum L = 0.5 m, w^2 = {W2:.3f} 1/s^2; miss = interval doubles w.p. q; both poles placed at `pole` for h0")
p("q_ms = largest q with E-moment growth < 1 (second-moment operator spectral radius); q_as = largest q (0.05 grid) with Lyapunov exponent < 0 (MC, 40000 steps)")
p("w*h0  pole  rho G(2h0) fixed/aware   fixed q_ms  q_as     aware q_ms  q_as")
for wh0 in (0.2, 0.5, 0.8, 1.1, 1.4):
    h0 = wh0 / W
    for pole in (0.8, 0.4, 0.0):
        k0 = P.gain(W2, h0, pole)
        fixed = lambda h, k0=k0: P.closed(W2, h, k0)
        aware = lambda h, pole=pole: P.closed(W2, h, P.gain(W2, h, pole))
        row = []
        for mats in (fixed, aware):
            g1, g2 = mats(h0), mats(2 * h0)
            qm = P.threshold(lambda q: P.ms_rate([g1, g2], [1 - q, q]) < 1.0, 0.0, 1.0, it=20)
            def as_ok(q):
                s = lambda r: 2 * h0 if r.random() < q else h0
                return P.lyapunov(s, mats, STEPS, random.Random(7)) < 0.0
            qa = 0.0
            for i in range(21):
                if as_ok(i / 20): qa = i / 20
                else: break
            row.append((qm or 0.0, qa, P.spectral_radius(g2)))
        (fm, fa, fr), (am, aa, ar) = row
        p(f"{wh0:4.1f}  {pole:4.1f}  {fr:8.3f}/{ar:5.3f}        {fm:9.3f}  {fa:5.2f}   {am:9.3f}  {aa:5.2f}")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(OUT) + "\n")
