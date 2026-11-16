"""E8-E9: what pooling drifting reports does to a valid e-process, and which bet
family the per-round test should use.  Writes experiments/results_drift.txt.
E8's pooled rule is exact (boundary DP with a per-round fault rate); everything
else is Monte Carlo with Wilson 95% intervals.  Stdlib only; a few minutes."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *
from sequential_slashing.exact import boundary

out = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); out.append(s)

A = 0.05


def wilson(k, n, z=1.959964):
    ph = k / n; d = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / d
    h = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def exact_slash_varying_rate(c, rates):
    """P(first crossing of boundary c by round len(rates)) when y_t ~ Bern(rates[t-1])."""
    mass, hit = [1.0], 0.0
    for t, r in enumerate(rates, 1):
        new = [0.0] * (len(mass) + 1)
        for s, m in enumerate(mass):
            if m: new[s] += m * (1 - r); new[s + 1] += m * r
        hit += sum(new[c[t]:]); mass = new[:c[t]]
    return hit


def mc(make, test, trials, seed):
    rng = random.Random(seed); taus = []
    for _ in range(trials):
        ps, ys = make(rng)
        taus.append(test(ys, ps))
    got = [t for t in taus if t is not None]
    lo, hi = wilson(len(got), trials)
    md = sorted(got)[len(got) // 2] if got else None
    return f"{len(got) / trials:.3f} [{lo:.3f}, {hi:.3f}]" + (f"  median delay {md}" if md else "")


say("E8. an honest verifier whose reports drift: 0.4 for 300 rounds, then 0.1 for 1700 (T=2000, alpha=0.05)")
ps8 = [0.4] * 300 + [0.1] * 1700
pbar = sum(ps8) / len(ps8)
c = boundary("mixture", pbar, A, 2000, K=32)
say(f"  constant-p mixture at the average report {pbar:.3f} (exact): P(slash) = {exact_slash_varying_rate(c, ps8):.6f}")
make8 = lambda rng: (ps8, [1 if rng.random() < x else 0 for x in ps8])
say(f"  per-round mixture, one-sided (2000 trials):  {mc(make8, lambda ys, ps: run_mixture_tv(ys, ps, A), 2000, 1)}")
say(f"  per-round mixture, two-sided (2000 trials):  {mc(make8, lambda ys, ps: run_mixture_tv(ys, ps, A, two_sided=True), 2000, 2)}")

say("E9. which bet family? reports p_t i.i.d.; slash rate within T and median delay (alpha=0.05, K=32)")
fams = [("pooled constant-p mixture, uniform grid", lambda ys, ps, pb: run_mixture(ys, pb, A, K=32)),
        ("pooled constant-p mixture, log grid", lambda ys, ps, pb: run_mixture(ys, pb, A, K=32, spacing="log")),
        ("per-round additive, uniform grid", lambda ys, ps, pb: run_mixture_tv(ys, ps, A)),
        ("per-round additive, log grid", lambda ys, ps, pb: run_mixture_tv(ys, ps, A, spacing="log")),
        ("per-round scale family", lambda ys, ps, pb: run_mixture_tv(ys, ps, A, family="scale")),
        ("per-round both (additive log + scale)", lambda ys, ps, pb: run_mixture_tv(ys, ps, A, spacing="log", family="both"))]
for label, lo, hi, T, trials in (("U[0.05, 0.35]", 0.05, 0.35, 3000, 400),
                                 ("log-uniform [0.01, 0.3]", 0.01, 0.3, 3000, 400)):
    if lo == 0.05:
        draw = lambda rng: 0.05 + 0.3 * rng.random()
        pb = 0.2
    else:
        draw = lambda rng: math.exp(math.log(0.01) + (math.log(0.3) - math.log(0.01)) * rng.random())
        pb = (0.3 - 0.01) / (math.log(0.3) - math.log(0.01))
    say(f"  reports {label} (mean {pb:.3f}), T={T}, {trials} trials each")
    for name, rate in (("cheater, true rate 1.5 p_t", lambda x: 1.5 * x),
                       ("cheater, true rate p_t + 0.02", lambda x: x + 0.02),
                       ("honest", lambda x: x)):
        make = lambda rng, f=rate: (lambda ps: (ps, [1 if rng.random() < f(x) else 0 for x in ps]))([draw(rng) for _ in range(T)])
        for fname, test in fams:
            say(f"    {name:30s} {fname:42s} {mc(make, lambda ys, ps, f=test: f(ys, ps, pb), trials, 11)}")
    make = lambda rng: (lambda ps: (ps, [1 if rng.random() < 0.5 * x else 0 for x in ps]))([draw(rng) for _ in range(T)])
    for fname, test in (("per-round additive, two-sided", lambda ys, ps: run_mixture_tv(ys, ps, A, two_sided=True)),
                        ("per-round scale, two-sided", lambda ys, ps: run_mixture_tv(ys, ps, A, two_sided=True, family="scale")),
                        ("per-round both, two-sided", lambda ys, ps: run_mixture_tv(ys, ps, A, two_sided=True, spacing="log", family="both"))):
        say(f"    {'over-reporter, true 0.5 p_t':30s} {fname:42s} {mc(make, test, trials, 13)}")

open(os.path.join(os.path.dirname(__file__), "results_drift.txt"), "w").write("\n".join(out) + "\n")
