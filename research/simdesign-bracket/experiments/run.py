"""Mesh convergence, then minimum-mass design under stress and deflection limits.

Three optimisers share one evaluation budget: random search, a coarse grid, and
differential evolution (scipy). Writes experiments/results.txt, bracket.stl, bracket.png.
"""
import os, sys, warnings, itertools
warnings.filterwarnings("ignore")
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from scipy.optimize import differential_evolution
from simdesign_bracket import Params, Material, solve, mass_g, build_polygon, check_printability, write_extruded_stl

MAT = Material()
DELTA_MAX = 4.0  # mm tip deflection limit (assumed requirement)
LB, UB = np.array([3.0, 0.0, 4.0]), np.array([25.0, 15.0, 30.0])  # w, r, b
H_OPT = 1.5
out = []
def say(s=""):
    print(s); out.append(s)

def design(x): return Params(w=float(x[0]), r=float(x[1]), b=float(x[2]))

evals = {"n": 0}
def penalised(x):
    evals["n"] += 1
    p = design(x); m = mass_g(p, MAT)
    r = solve(p, MAT, H_OPT)
    viol = max(0, r["max_vm_mpa"] / MAT.sigma_allow - 1) + max(0, r["tip_deflection_mm"] / DELTA_MAX - 1)
    return m * (1 + 20 * viol) + (1000 * viol if viol else 0), m, viol, r

say("# simdesign-bracket results (mm, N, MPa, g; material inputs are assumed)")
say(f"stress limit {MAT.sigma_allow} MPa, tip deflection limit {DELTA_MAX} mm, load {Params().F} N, E={MAT.E} MPa, nu={MAT.nu}, rho={MAT.density} g/mm^3")
say("\n## 1. Mesh convergence (baseline design w=12, b=15)")
say("r(mm)  h(mm)  elements  tip(mm)  max_vm(MPa)")
for r in (0.0, 6.0):
    for h in (3.0, 2.0, 1.5, 1.0, 0.7):
        s = solve(Params(w=12, r=r, b=15), MAT, h)
        say(f"{r:4.1f}  {h:5.2f}  {s['n_elements']:8d}  {s['tip_deflection_mm']:7.3f}  {s['max_vm_mpa']:8.2f}")

BUDGET = 150
say(f"\n## 2. Optimisation, {BUDGET} FE evaluations each (h={H_OPT} mm), minimise mass")
results = {}
# random search
rng = np.random.default_rng(0); best = None
for _ in range(BUDGET):
    x = LB + rng.random(3) * (UB - LB)
    f, m, v, r = penalised(x)
    if v == 0 and (best is None or m < best[1]): best = (x, m, r)
results["random search"] = best
# grid 5x5x6 = 150
best = None
for x in itertools.product(np.linspace(3, 25, 5), np.linspace(0, 15, 5), np.linspace(4, 30, 6)):
    f, m, v, r = penalised(np.array(x))
    if v == 0 and (best is None or m < best[1]): best = (np.array(x), m, r)
results["grid 5x5x6"] = best
# differential evolution: 16 Sobol points x 9 generations = 144 evaluations
cnt = {"n": 0}; feas = []
def fobj(x):
    cnt["n"] += 1
    f, m, v, r = penalised(x)
    if v == 0: feas.append((m, np.array(x), r))
    return f
differential_evolution(fobj, list(zip(LB, UB)), popsize=5, maxiter=8, seed=0, tol=0, polish=False, init="sobol")
results["differential evolution"] = min(feas, key=lambda t: t[0])[1:] and (min(feas, key=lambda t: t[0])[1], min(feas, key=lambda t: t[0])[0], min(feas, key=lambda t: t[0])[2])
say(f"(differential evolution used {cnt['n']} evaluations)")
say("method                   w(mm)  r(mm)  b(mm)  mass(g)  max_vm(MPa)  tip(mm)")
for k, v in results.items():
    if v is None: say(f"{k:24s} no feasible design found"); continue
    x, m, r = v
    say(f"{k:24s} {x[0]:6.2f} {x[1]:6.2f} {x[2]:6.2f} {m:8.2f} {r['max_vm_mpa']:10.2f} {r['tip_deflection_mm']:8.3f}")

feas_res = {k: v for k, v in results.items() if v}
name = min(feas_res, key=lambda k: feas_res[k][1])
x, m, r = feas_res[name]
say(f"\nbest: {name}")
say("\n## 3. Re-check of the best design on finer meshes")
p = design(x)
for h in (1.5, 1.0, 0.7, 0.5):
    s = solve(p, MAT, h)
    say(f"h={h:4.2f}  elements {s['n_elements']:6d}  tip {s['tip_deflection_mm']:.3f} mm  max_vm {s['max_vm_mpa']:.2f} MPa")
base = Params()
sb = solve(base, MAT, 0.7)
say(f"\nreference design w={base.w}, r={base.r}, b={base.b}: mass {mass_g(base, MAT):.2f} g, max_vm {sb['max_vm_mpa']:.2f} MPa, tip {sb['tip_deflection_mm']:.3f} mm (h=0.7)")

say("\n## 4. Printability of the best design")
for k, v in check_printability(p).items(): say(f"{k}: {v}")
info = write_extruded_stl(os.path.join(HERE, "bracket.stl"), build_polygon(p, 48), p.b)
say(f"STL: {info['triangles']} triangles, volume {info['volume_mm3']:.1f} mm^3 -> {info['volume_mm3'] * MAT.density:.2f} g (mass_g {mass_g(p, MAT):.2f})")

try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    q = build_polygon(p, 48)
    fig, ax = plt.subplots(figsize=(4, 4)); ax.fill(q[:, 0], q[:, 1], color="#74c0fc", ec="k")
    ax.set_aspect("equal"); ax.set_title(f"w={p.w:.1f} r={p.r:.1f} b={p.b:.1f} mm"); fig.savefig(os.path.join(HERE, "bracket.png"), dpi=120, bbox_inches="tight")
except Exception as e:
    say(f"(plot skipped: {e})")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
