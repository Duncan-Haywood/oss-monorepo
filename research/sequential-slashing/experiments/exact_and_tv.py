"""E5-E7: exact operating characteristics (no Monte Carlo), a sweep over the
claimed fault rate p, and the time-varying p_t case the note's motivation needs.
Writes experiments/results_exact.txt. Stdlib only; about a minute."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *

out = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); out.append(s)

A = 0.05
say("E5. exact values for the E1/E2 setting (p=0.2, q=0.3, alpha=0.05; boundary DP, src/sequential_slashing/exact.py)")
z = exact_slash_prob("z", 0.2, A, 2000)
lr = exact_slash_prob("lr", 0.2, A, 2000, q=0.3)
mx = exact_slash_prob("mixture", 0.2, A, 2000, K=32)
say(f"  false slash within T=2000: peeking z {z:.4f}   LR {lr:.4f}   mixture(K=32) {mx:.4f}")
ml, _ = exact_mean_delay("lr", 0.2, 0.3, A, 3000, q=0.3)
mm, _ = exact_mean_delay("mixture", 0.2, 0.3, A, 3000, K=32)
w = wald_lower(A, 0.3, 0.2)
say(f"  mean delay: LR {ml:.1f}  mixture {mm:.1f}  Wald {w:.1f}  LR overshoot {ml / w - 1:+.1%}  price of not knowing q x{mm / ml:.2f}")
say("  alpha sweep (LR, q=0.3): " + "  ".join(
    f"a={a}: {exact_mean_delay('lr', 0.2, 0.3, a, 6000, q=0.3)[0]:.1f}/{wald_lower(a, 0.3, 0.2):.1f}"
    for a in (0.2, 0.05, 0.01, 0.001)) + "   (exact mean / Wald)")
say("  q sweep (LR, alpha=0.05): " + "  ".join(
    f"q={q}: {exact_mean_delay('lr', 0.2, q, A, 6000, q=q)[0]:.1f}/{wald_lower(A, q, 0.2):.1f}"
    for q in (0.25, 0.3, 0.4, 0.6)))

say("E6. sweep over the claimed rate p; cheater reports p, true rate q = 1.5p (alpha=0.05, exact)")
say("  T = 12 x Wald + 200. 'detected' is P(slashed by T); a mean delay is shown only when that is >= 0.99.")
say("  p      z false(T=2000)  LR false  uniform-grid false  log-grid false   Wald  LR delay  uniform-grid delay  log-grid delay")
def dcell(d, P):
    return f"{d:6.0f} (x{d / dl:.2f})" if P >= 0.99 else f"detects {P:.2f}"
for p in (0.01, 0.05, 0.2, 0.5):
    q = 1.5 * p
    w = wald_lower(A, q, p)
    T = int(12 * w) + 200
    fz = exact_slash_prob("z", p, A, 2000)
    fl = exact_slash_prob("lr", p, A, T, q=q)
    fu = exact_slash_prob("mixture", p, A, T, K=32)
    fg = exact_slash_prob("mixture", p, A, T, K=32, spacing="log")
    dl, Pl = exact_mean_delay("lr", p, q, A, T, q=q)
    du, Pu = exact_mean_delay("mixture", p, q, A, T, K=32)
    dg, Pg = exact_mean_delay("mixture", p, q, A, T, K=32, spacing="log")
    say(f"  {p:<5}  {fz:.4f}           {fl:.4f}    {fu:.4f}              {fg:.4f}          {w:5.0f}  {dl:6.0f}    {dcell(du, Pu):<18}  {dcell(dg, Pg)}")

say("E7. time-varying claims: p_t log-uniform on [0.01, 0.3] each round, T=1000, K=16, 400 trials (Monte Carlo; +/- is 1 SE)")
rng = random.Random(2026)
N, T = 400, 1000
def draw_ps():
    return [math.exp(rng.uniform(math.log(0.01), math.log(0.3))) for _ in range(T)]
def zpeek_tv(ys, ps, t0=30, zc=1.6448536269514722):
    s = mu = v = 0.0
    for t, (y, p) in enumerate(zip(ys, ps), 1):
        s += y; mu += p; v += p * (1 - p)
        if t >= t0 and (s - mu) / math.sqrt(v) >= zc: return t
    return None
rows = {"honest": lambda p: p, "under-reports x1.5": lambda p: min(1, 1.5 * p),
        "over-reports x2 (true p/2)": lambda p: p / 2}
for label, f in rows.items():
    hits = {"z-peek": [], "tv one-sided": [], "tv two-sided": [], "tv two-sided log-grid": []}
    for _ in range(N):
        ps = draw_ps()
        ys = [1 if rng.random() < f(p) else 0 for p in ps]
        hits["z-peek"].append(zpeek_tv(ys, ps))
        hits["tv one-sided"].append(run_mixture_tv(ys, ps, A, K=16))
        hits["tv two-sided"].append(run_mixture_tv(ys, ps, A, K=16, two_sided=True))
        hits["tv two-sided log-grid"].append(run_mixture_tv(ys, ps, A, K=16, two_sided=True, spacing="log"))
    cells = []
    for k, ts in hits.items():
        got = [t for t in ts if t is not None]
        r = len(got) / N
        se = math.sqrt(r * (1 - r) / N)
        d = f" mean t {sum(got) / len(got):.0f}" if got and label != "honest" else ""
        cells.append(f"{k}: {r:.3f}+/-{se:.3f}{d}")
    say(f"  {label}:")
    for c in cells: say(f"    {c}")
open(os.path.join(os.path.dirname(__file__), "results_exact.txt"), "w").write("\n".join(out) + "\n")
