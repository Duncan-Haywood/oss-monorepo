import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from decision_regret_transfer import *

out = []
def p(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

p("E1. binary accept/reject, A+R=1, tau=R. delta(eps) = least excess score for decision regret eps (exact) vs closed form")
for tau in (0.5, 0.1, 0.02):
    C = Costs(1 - tau, tau)
    for eps in (0.01, 0.05):
        b, l = delta(C, "brier", eps), delta(C, "log", eps)
        p(f"  tau={tau} eps={eps}: brier={b:.6f} (eps^2={eps**2:.6f}) | log={l:.6f} (KL={min(log_D(tau+eps,tau), log_D(tau-eps,tau) if tau>eps else 9):.6f}, eps^2/(2tau(1-tau))={eps**2/(2*tau*(1-tau)):.6f})")

p("E2. guaranteed decision regret at excess log score s=0.01 nats, binary, by fault-cost ratio A/R (tau=R/(A+R), A+R=1)")
for ratio in (1, 4, 10, 50, 200):
    tau = 1 / (1 + ratio)
    C = Costs(1 - tau, tau)
    h = envelope(C, "log")
    hb = envelope(C, "brier")
    p(f"  A/R={ratio:>3} tau={tau:.4f}: log bound={regret_bound(h,0.01):.4f} (sqrt(2 tau(1-tau) s)={math.sqrt(2*tau*(1-tau)*0.01):.4f}) | brier s=0.01 bound={regret_bound(hb,0.01):.4f}")

p("E3. weighted hinge (polyhedral): min over wrong-side (eta,f) of excess risk / decision regret -> linear transfer, constant 1")
for tau in (0.5, 0.1, 0.02):
    w = min(hinge_regret(tau, e / 1000, f / 100) / abs(e / 1000 - tau) for e in range(1001) for f in range(-100, 101)
            if e / 1000 != tau and f != 0 and (f < 0) == (e / 1000 > tau))
    p(f"  tau={tau}: min excess-risk/regret ratio = {w:.4f}")

p("E4. adding an audit action, A=R=1: exact delta at eps=0.1 with and without audit at cost c")
for c in (None, 0.4, 0.25, 0.1):
    C = Costs(1.0, 1.0, c=c)
    p(f"  c={c}: regions={ {k:(round(v[0],3),round(v[1],3)) for k,v in C.regions.items()} } brier={delta(C,'brier',0.1):.5f} log={delta(C,'log',0.1):.5f} max regret={C.max_regret():.2f}")

p("E5. certificates vs simulation. A=R=1, c=0.2, eta~Beta(2,5), q=expit(slope*logit(eta)+shift+sigma z), 100k draws")
C = Costs(1.0, 1.0, c=0.2)
for rule in ("brier", "log"):
    h = envelope(C, rule)
    for name, sl, sh, sg in (("noisy", 1.0, 0.0, 0.5), ("noisier", 1.0, 0.0, 1.5), ("overconfident", 2.0, 0.0, 0.3), ("biased-low", 1.0, -1.0, 0.3), ("underconfident", 0.5, 0.0, 0.0)):
        S, Rg = simulate(C, rule, 2, 5, sl, sh, sg)
        B = regret_bound(h, S)
        p(f"  {rule:5} {name:14}: excess score={S:.4f} realised regret={Rg:.4f} certificate={B:.4f} realised/certificate={Rg/B:.2f}")

p("E6. worst case: verifier sits exactly on the tight pair (eta just past a region edge, q at the edge): certificate is attained")
C = Costs(0.9, 0.1)  # tau=0.1
eps = 0.05
eta = 0.1 + eps
S = log_D(eta, 0.1)
p(f"  point mass eta={eta}, q=tau: excess log={S:.6f}, delta(eps)={delta(C,'log',eps):.6f}, regret of acting on q=tau-: {C.regret(eta,'accept'):.4f} = eps")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
