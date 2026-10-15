"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import numpy as np
from ambient_misread.sim import Params, contexts, URGENCY
from ambient_misread.infer import confusion, mean_values, policy_values, simulate_policy, PRIOR

P = Params()
C = contexts()
ACCS = (1 / 3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0)

for kind in ("uniform", "adjacent"):
    print(f"1. Mean utility per message over {len(C)} contexts, {kind} errors")
    print("   acc    oracle   bayes   naive   blind   naive-blind  bayes-blind")
    for a in ACCS:
        v = mean_values(P, C, confusion(a, kind))
        print(f"   {a:.3f}  {v['oracle']:.4f}  {v['bayes']:.4f}  {v['naive']:.4f}  {v['blind']:.4f}  "
              f"{v['naive'] - v['blind']:+.4f}      {v['bayes'] - v['blind']:+.4f}")
    print()

print("2. Break-even accuracy: smallest accuracy (grid step 0.005) at which acting on the label")
print("   naively is no worse than ignoring it (mean over contexts)")
for kind in ("uniform", "adjacent"):
    grid = np.arange(1 / 3 if kind == "uniform" else 0.5, 1.0001, 0.005)
    be = next((a for a in grid if (lambda v: v['naive'] >= v['blind'])(mean_values(P, C, confusion(a, kind)))), None)
    print(f"   {kind}: {be:.3f}")

print("\n3. Share of the oracle-over-blind gain that each policy recovers (uniform errors)")
for a in (0.5, 0.7, 0.9):
    v = mean_values(P, C, confusion(a))
    g = v['oracle'] - v['blind']
    print(f"   acc {a}: naive {(v['naive'] - v['blind']) / g:+.2f}, bayes {(v['bayes'] - v['blind']) / g:+.2f}  (gain {g:.4f})")

print("\n4. Worst-case contexts at accuracy 0.7 (uniform): naive minus blind, five lowest")
rows = sorted(((policy_values(P, c, confusion(0.7))['naive'] - policy_values(P, c, confusion(0.7))['blind'], c) for c in C))
for d, c in rows[:5]:
    print(f"   words {c[0]}, noise {c[1]}, others {c[2]}, eyes_busy {c[3]}: {d:+.4f}")
print(f"   contexts where naive < blind at acc 0.7: {sum(d < -1e-12 for d, _ in rows)} of {len(C)}")

print("\n5. Monte Carlo check (|closed form - simulation|, 200000 messages, 3 contexts x 4 policies, acc 0.7 uniform)")
rng = np.random.default_rng(0)
worst = 0.0
Cm = confusion(0.7)
for c in [(6, 0.5, 1, False), (12, 0.0, 0, True), (3, 1.0, 1, False)]:
    v = policy_values(P, c, Cm)
    for k in v:
        worst = max(worst, abs(v[k] - simulate_policy(P, c, Cm, k, 200000, rng)))
print(f"   worst abs difference: {worst:.4f}")

print("\n6. Wrong prior: classifier accuracy 0.7 (uniform); Bayes uses an assumed prior, truth is the model's mix")
from ambient_misread.infer import posterior, _u_table
from ambient_misread.sim import MODES
Cm = confusion(0.7)
for name, assumed in [("true mix", PRIOR), ("flat", np.ones(3) / 3), ("all high-heavy", np.array([0.1, 0.3, 0.6]))]:
    post = posterior(Cm, assumed)
    tot = 0.0
    for c in C:
        U = _u_table(P, c)
        for o in range(3):
            m = int(np.argmax(post[o] @ U))
            tot += float((PRIOR * Cm[:, o]) @ U[:, m])
    print(f"   assumed prior {name:15s}: bayes {tot / len(C):.4f}")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
    xs = np.linspace(1 / 3, 1.0, 40)
    for ax, kind in zip(axs, ("uniform", "adjacent")):
        vs = [mean_values(P, C, confusion(a, kind)) for a in xs]
        for k, st in (("oracle", "k:"), ("bayes", "C0-"), ("naive", "C3-"), ("blind", "C7--")):
            ax.plot(xs, [v[k] for v in vs], st, label=k)
        ax.set_title(f"{kind} errors"); ax.set_xlabel("urgency-label accuracy")
    axs[0].set_ylabel("mean utility per message"); axs[0].legend(fontsize=8)
    fig.suptitle("Stylised model: acting on a noisy urgency label", fontsize=10)
    fig.tight_layout(); fig.savefig("experiments/accuracy.png", dpi=110)
except ImportError:
    pass
