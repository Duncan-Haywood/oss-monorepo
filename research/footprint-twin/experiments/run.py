"""Experiments for footprint-twin. Pure Python; output also written to experiments/results.txt."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from footprint_twin.model import (pass_prob, pass_prob_geometric, required_gap, circle_twin_pass, calibrated_radius, theta_star)

L, W = 1.0, 0.5
R = math.hypot(L, W)
out = []


def p(s=""):
    print(s)
    out.append(s)


rng = random.Random(7)
p(f"robot: L={L} m, W={W} m, circumscribed diameter {R:.4f} m; heading error theta ~ N(0, sigma^2)")

p("\n[1] closed-form pass probability vs Monte Carlo over corner geometry (60000 draws)")
p("gap_m sigma_rad exact   mc     theta*_rad")
for g, s in ((0.55, 0.05), (0.60, 0.05), (0.70, 0.10), (0.80, 0.15), (0.90, 0.30)):
    n = 60000
    mc = sum(pass_prob_geometric(L, W, g, rng.gauss(0, s)) for _ in range(n)) / n
    p(f"{g:.2f}   {s:.2f}      {pass_prob(L, W, g, s):.4f}  {mc:.4f}  {theta_star(L, W, g):.4f}")

p("\n[2] pass probability vs gap at sigma=0.05: real vs circle twins")
rho_in, rho_out = W / 2, R / 2
rho_cal = calibrated_radius(L, W, 0.05, 0.95)
p(f"inscribed r={rho_in:.3f}; circumscribed r={rho_out:.4f}; calibrated (95% at sigma=0.05) r={rho_cal:.4f} (gap {2 * rho_cal:.4f})")
p("gap_m  real    inscribed circumscribed calibrated")
for g in (0.50, 0.52, 0.54, 0.56, 0.58, 0.60, 0.70, 0.80, 0.90, 0.99):
    p(f"{g:.2f}  {pass_prob(L, W, g, 0.05):.4f}  {circle_twin_pass(rho_in, g):.0f}         {circle_twin_pass(rho_out, g):.0f}            {circle_twin_pass(rho_cal, g):.0f}")

p("\n[3] gap needed for 95% pass vs heading-error scale; calibrated twin fixed at its sigma=0.05 gap")
gcal = 2 * rho_cal
p(f"calibrated twin gap {gcal:.4f} m")
p("sigma  real_gap  twin_gap_error_m  real_pass_at_twin_gap")
for s in (0.02, 0.05, 0.10, 0.15, 0.20, 0.30):
    rg = required_gap(L, W, s, 0.95)
    p(f"{s:.2f}   {rg:.4f}    {gcal - rg:+.4f}           {pass_prob(L, W, gcal, s):.4f}")

p("\n[4] n-gap missions (independent heading errors, sigma=0.05, gap = calibrated twin gap)")
p("n   real_mission_success  twin_says  gap_needed_for_95%_mission")
for n in (1, 3, 5, 10, 20):
    rg = required_gap(L, W, 0.05, 0.95 ** (1.0 / n))
    p(f"{n:2d}  {pass_prob(L, W, gcal, 0.05) ** n:.4f}               1.0000     {rg:.4f}")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
