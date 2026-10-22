"""Tables for free-missedpd. Stdlib only, seed 7. Writes experiments/results.txt."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import missed as m

H0 = 0.1
RS = (0.0, 0.3, 0.5, 0.7, 0.9)
out = []


def p(s=""):
    print(s)
    out.append(s)


p("# free-missedpd: PD loop on x''=u, h0=0.1, poles at z=r, geometric missed-sample runs")
p("## deterministic spectral radius of the closed loop when every interval is k*h0")
p("r      k=1    k=2    k=3    k=4    k=6    k=10")
for r in RS:
    kp, kd = m.gains(r, H0)
    p(f"{r:<5}" + "".join(f"  {m.spectral_radius2(m.step_matrix(k * H0, kp, kd)):6.3f}" for k in (1, 2, 3, 4, 6, 10)))
p()
p("## largest miss probability q (each sample lost independently; a run of lost samples lengthens the interval)")
p("r     q_meansquare   q_almost_sure (N=200000, tol 0.002)")
rows = {}
for r in RS:
    qms = m.bisect_q(lambda q: m.ms_stable(q, r, H0))
    qas = m.bisect_q(lambda q: m.lyapunov(q, r, H0) < 0)
    rows[r] = (qms, qas)
    p(f"{r:<5} {qms:10.3f}   {qas:10.3f}")
p()
p("## Lyapunov exponent per sample at selected q (negative = converges almost surely)")
p("r     q      lambda")
for r, q in ((0.5, 0.2), (0.5, 0.3), (0.5, 0.4), (0.5, 0.5), (0.7, 0.4), (0.7, 0.6)):
    p(f"{r:<5} {q:<5}  {m.lyapunov(q, r, H0):8.4f}")
p()
p("## the second-moment operator against Monte Carlo: E|state|^2 after 3 samples (400000 runs, start (1,0))")
p("r     q      operator     Monte Carlo")
for r, q in ((0.5, 0.1), (0.7, 0.2), (0.5, 0.3), (0.7, 0.4)):
    p(f"{r:<5} {q:<5}  {m.exact_moment(q, r, H0, 3):.5g}   {m.mc_moment(q, r, H0, 3, 400000, seed=3)[0]:.5g}")
p()
p("## r=0.5: share of runs (3000 runs x 400 samples) that end with |state| < 1e-6")
p("q      mean-square test   almost-sure     share converged")
for q in (0.2, 0.4, 0.55, 0.65, 0.75):
    p(f"{q:<5}  {'stable' if m.ms_stable(q, 0.5, H0) else 'unstable':8}           {'stable' if m.lyapunov(q, 0.5, H0) < 0 else 'unstable':8}        {m.mc_moment(q, 0.5, H0, 400, 3000)[1]:.3f}")
with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
