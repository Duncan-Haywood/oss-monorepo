import math
import pathlib
import sys

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "src"))
sys.path.insert(0, str(here.parents[1] / "selfrep-growth" / "src"))
from selfrep_extinction_kits.chain import first_generation_extinction, solve
from selfrep_extinction_kits.des import run
from selfrep_growth.params import printer_copy

W, V, _, _ = printer_copy()
SAFE, N = 6, 4000


def se(p, n):
    return math.sqrt(max(p * (1 - p), 1e-12) / n)


out = [f"inputs from selfrep-growth/selfrep-closure (assumed): W={W:.1f} h, V={V:.1f} units per copy; kit = V units, kit rate a = B/V",
       f"A,B: 'safe' = fleet reaches {SAFE} machines; {N} simulated runs per row (seeds 0..{N-1}); +- is one binomial standard error.",
       "chain = exact solution (Markov chain: Poisson kits, exponential builds and lives); gen1 = closed-form chance the seed retires before its first copy.", ""]

out.append("== A. early extinction: P(fleet hits 0 before reaching 6), one new machine, empty stock")
out.append("   chain truncation check: nmax 30/kmax 12 vs nmax 40/kmax 20 (should agree)")
hdr = f"{'case':16}{'gen1':>7}{'chain':>8}{'chain(big)':>11}   {'sim: poisson,exp':>18}{'regular,exp':>14}{'regular,logn':>14}{'regular,fixed':>15}"
out.append(hdr)
cases = [(500, 4), (2000, 4), (1000, 4), (500, 8), (200, 16), (300, 8), (500, 2)]
for L, B in cases:
    a = B / V
    ch = solve(a, W, L, safe=SAFE)["p_extinct_first"]
    chb = solve(a, W, L, nmax=40, kmax=20, safe=SAFE)["p_extinct_first"]
    g1 = first_generation_extinction(a, W, L)
    row = f"L={L:<5}B={B:<4}{g1:7.3f}{ch:8.3f}{chb:11.3f}   "
    for kits, build in (("poisson", "exp"), ("regular", "exp"), ("regular", "lognormal"), ("regular", "fixed")):
        k = sum(run(a, W, L, s, kits, build, safe=SAFE)[0] == "extinct" for s in range(N))
        p = k / N
        row += f"{p:11.3f}+-{se(p, N):.3f}"
    out.append(row)

out += ["", "== B. Weibull shape of life (regular kits, lognormal builds) vs the chain at the same mean life, L=500 h, B=4"]
a = 4 / V
out.append(f"chain (exponential life) {solve(a, W, 500, safe=SAFE)['p_extinct_first']:.3f}")
for shape in (1, 2, 3, 5):
    k = sum(run(a, W, 500, s, "regular", "lognormal", life_shape=shape, safe=SAFE)[0] == "extinct" for s in range(N))
    out.append(f"shape {shape}: sim {k/N:.3f}+-{se(k/N, N):.3f}")

out += ["", "== C. mean time to extinction (hours) when the equilibrium fleet is small; chain exact vs simulation to extinction",
        "   chain with nmax 20/kmax 8 and nmax 30/kmax 12 shown for the truncation check; sim = Poisson kits, exponential builds and lives, 2000 runs, cap 1e7 h",
        f"{'case':16}{'fluid N*':>9}{'chain(20/8)':>13}{'chain(30/12)':>14}{'sim mean +- SE':>20}{'sim,regular/logn':>20}"]
R = 2000
for L, B in ((75, 4), (100, 4), (200, 4), (300, 4), (200, 8)):
    a = B / V
    t1 = solve(a, W, L, nmax=20, kmax=8)["mean_time"]
    t2 = solve(a, W, L, nmax=30, kmax=12)["mean_time"]
    ts = [run(a, W, L, s, "poisson", "exp", horizon=1e7, nmax=30) for s in range(R)]
    assert all(o == "extinct" for o, _ in ts)
    m = sum(t for _, t in ts) / R
    sd = math.sqrt(sum((t - m) ** 2 for _, t in ts) / (R - 1)) / math.sqrt(R)
    ts2 = [run(a, W, L, s, "regular", "lognormal", horizon=1e7, nmax=30) for s in range(R)]
    m2 = sum(t for _, t in ts2) / R
    nstar = B * L / V  # fluid equilibrium, no failures, no recycling
    out.append(f"L={L:<5}B={B:<4}{nstar:9.1f}{t1:13.0f}{t2:14.0f}{m:12.0f} +- {sd:5.0f}{m2:14.0f}")
text = "\n".join(out)
print(text)
(here / "results.txt").write_text(text + "\n")
