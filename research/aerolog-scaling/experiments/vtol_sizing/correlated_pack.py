"""Milestone 10r: does the independence assumption between pack peak power and cell energy density matter? (closes 10n's "Next")

10m/10n sampled p_batt (800-3000 W/kg) and e_cell (200-400 Wh/kg) independently. Real cells trade one for the other, so this
couples them with a Gaussian copula at rank correlation rho in {-0.9, -0.6, -0.3, 0, +0.3}, keeping both marginals uniform on
10m's ranges and sampling the other ten inputs as in 10m. rho is swept, not measured (10o's four Molicel cells are too few to fit).
Predictions (written before the first run):
 (P1) the median break-even over rho in [-0.9, 0.3] moves by less than 6 km (p_batt dominates; e_cell total effect is 0.067);
 (P2) the p90 - p10 width at rho = -0.9 differs from the width at rho = 0 by less than 20%;
 (P3) with rho = -0.9 the break-even is no lower than with rho = 0 (a high-power pack then has low energy density, but 10k showed
      energy density does not bind at 150 km while power does).
Stdlib only. N = 4000, seed 7.
"""
import math, random, sys
from global_sensitivity import RANGES, be

def phi(z): return 0.5 * (1 + math.erf(z / math.sqrt(2)))

def pct(v, q):
    v = sorted(v); return v[int(q * (len(v) - 1))]

def main(N=4000, seed=7):
    print(f"Milestone 10r: break-even range (km) when p_batt and e_cell are coupled by a Gaussian copula (N={N}, seed {seed})")
    print("rho    median  p10  p90  width   mean p_batt  mean e_cell")
    for rho in (-0.9, -0.6, -0.3, 0.0, 0.3):
        rng = random.Random(seed)
        ys = []; sp = se = 0.0
        for _ in range(N):
            x = {k: rng.uniform(*r) for k, r in RANGES.items() if k not in ("p_batt", "e_cell")}
            z1, z2 = rng.gauss(0, 1), rng.gauss(0, 1)
            z2 = rho * z1 + math.sqrt(1 - rho * rho) * z2
            x["p_batt"] = RANGES["p_batt"][0] + phi(z1) * (RANGES["p_batt"][1] - RANGES["p_batt"][0])
            x["e_cell"] = RANGES["e_cell"][0] + phi(z2) * (RANGES["e_cell"][1] - RANGES["e_cell"][0])
            sp += x["p_batt"]; se += x["e_cell"]
            ys.append(be(x))
        m, a, b = pct(ys, .5), pct(ys, .1), pct(ys, .9)
        print(f"{rho:+.1f}  {m:6.0f} {a:4.0f} {b:4.0f} {b-a:6.0f}   {sp/N:10.0f}  {se/N:10.0f}")

if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:]))
