"""Equal-budget comparison on the tightened bracket problem. Writes experiments/results.txt and curves.png.

Baselines (random search, CMA-ES, GP-EI Bayesian optimisation) run over 20 seeds with 40 FE evaluations.
The session agent's four rounds of 10 proposals (proposals/round*.json) are scored once: n = 1 trajectory.
A differential-evolution run with about 1,800 evaluations gives a best-known reference."""
import os, sys, glob, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from scipy.optimize import differential_evolution
from simdesign_llm import Problem, LB, UB, random_search, cma_es, bayes_opt, score_proposals, best_curve

BUDGET, SEEDS, PTS = 40, 20, [10, 20, 30, 40]
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

pr = Problem()
say(f"# simdesign-llm results (mm, N, MPa, g; material inputs are assumed)")
say(f"stress limit {pr.mat.sigma_allow} MPa, tip deflection limit {pr.delta_max} mm, load {pr.F} N, mesh h {pr.mesh_h} mm, budget {BUDGET} FE evaluations, {SEEDS} seeds for baselines")

ref = Problem()
cache = []
def f(x):
    r = ref.evaluate(x); cache.append(r); return ref.penalised(r)
differential_evolution(f, list(zip(LB, UB)), maxiter=40, popsize=15, seed=0, tol=0, polish=False)
feas = [r for r in cache if r["feasible"]]
rb = min(feas, key=lambda r: r["mass_g"])
say(f"\n## Best-known reference: differential evolution, {ref.n_evals} evaluations")
say(f"best feasible: x={[round(v,2) for v in rb['x']]} mass {rb['mass_g']:.2f} g stress {rb['stress_mpa']:.2f} tip {rb['tip_mm']:.2f}")

curves = {}
for name, fn in (("random search", random_search), ("CMA-ES", cma_es), ("Bayesian opt (GP-EI)", bayes_opt)):
    curves[name] = np.array([best_curve(fn(Problem(), BUDGET, s), PTS) for s in range(SEEDS)])
agent_recs = score_proposals(Problem(), sorted(glob.glob(os.path.join(HERE, "..", "proposals", "round*.json"))))
agent = np.array(best_curve(agent_recs, PTS))

say("\n## Best feasible mass (g) after n evaluations; median [min, max] over seeds, and number of seeds with any feasible design")
say("method".ljust(24) + "".join(f"n={n}".rjust(26) for n in PTS))
for name, c in curves.items():
    row = name.ljust(24)
    for j in range(len(PTS)):
        v = c[:, j]; k = int((~np.isnan(v)).sum())
        row += (f"{np.nanmedian(v):.2f} [{np.nanmin(v):.2f},{np.nanmax(v):.2f}] {k}/{SEEDS}" if k else f"none 0/{SEEDS}").rjust(26)
    say(row)
say("session agent (n=1)".ljust(24) + "".join((f"{v:.2f}" if not np.isnan(v) else "none").rjust(26) for v in agent))
fa = [r for r in agent_recs if r["feasible"]]
ab = min(fa, key=lambda r: r["mass_g"])
say(f"\nagent best: x={[round(v,2) for v in ab['x']]} mass {ab['mass_g']:.2f} g stress {ab['stress_mpa']:.2f} tip {ab['tip_mm']:.2f}")
say(f"agent feasible proposals: {len(fa)}/{len(agent_recs)}")
for r in (1, 2, 3, 4):
    rr = agent_recs[(r-1)*10:r*10]
    say(f"  round {r}: {sum(q['feasible'] for q in rr)}/10 feasible, best feasible {min([q['mass_g'] for q in rr if q['feasible']], default=float('nan')):.2f} g")
say("\n## Final (n=40) gap to the best-known reference, percent")
for name, c in curves.items():
    v = c[:, -1]; v = v[~np.isnan(v)]
    say(f"{name.ljust(24)} median {100*(np.median(v)/rb['mass_g']-1):+.1f}%   best seed {100*(v.min()/rb['mass_g']-1):+.1f}%")
say(f"{'session agent (n=1)'.ljust(24)} {100*(agent[-1]/rb['mass_g']-1):+.1f}%")
say("\n## Fraction of baseline seeds whose n=40 result beats the agent's")
for name, c in curves.items():
    v = c[:, -1]; k = int(np.nansum(v < agent[-1]))
    say(f"{name.ljust(24)} {k}/{SEEDS}")

with open(os.path.join(HERE, "results.txt"), "w") as fh: fh.write("\n".join(out) + "\n")
try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    ns = np.arange(1, BUDGET + 1)
    fig, ax = plt.subplots(figsize=(6, 4))
    for name, fn in (("random search", random_search), ("CMA-ES", cma_es), ("Bayesian opt (GP-EI)", bayes_opt)):
        cs = np.array([best_curve(fn(Problem(), BUDGET, s), list(ns)) for s in range(SEEDS)])
        ax.plot(ns, np.nanmedian(cs, 0), label=name + " (median)")
    ax.plot(ns, best_curve(agent_recs, list(ns)), "k", lw=2, label="session agent (n=1)")
    ax.axhline(rb["mass_g"], ls=":", c="gray", label="best known")
    ax.set_xlabel("FE evaluations"); ax.set_ylabel("best feasible mass (g)"); ax.set_ylim(20, 50); ax.legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(HERE, "curves.png"), dpi=120)
except Exception as e:
    print("plot skipped", e)
print("ok")
