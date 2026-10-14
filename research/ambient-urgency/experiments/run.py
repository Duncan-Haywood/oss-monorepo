"""Run: PYTHONPATH=src python3 experiments/run.py > experiments/results.txt"""
import numpy as np
from collections import Counter
from ambient_urgency.sim import (Params, MODES, URGENCY, contexts, utilities, best_mode, simulate_utility,
                                 mix_utility, regret, with_)

P = Params()
C = contexts()
print(f"{len(C)} contexts x {len(URGENCY)} urgency classes (mix {[v[2] for v in URGENCY.values()]})\n")

print("1. Best mode by urgency (share of contexts)")
for u in URGENCY:
    cnt = Counter(best_mode(P, *c, u) for c in C)
    print(f"  {u:7s}", {m: round(cnt[m] / len(C), 2) for m in MODES})

print("\n2. Value of adding chime_glance (mean utility per message, urgency mix)")
three = ("none", "speech", "glance")
u3 = mix_utility(P, lambda c, u: best_mode(P, *c, u, three), C)
u4 = mix_utility(P, lambda c, u: best_mode(P, *c, u), C)
print(f"  best of 3 modes {u3:.4f}; best of 4 modes {u4:.4f}; gain {u4 - u3:.4f}")
for u in URGENCY:
    g = np.mean([utilities(P, *c, u)[best_mode(P, *c, u)] - utilities(P, *c, u)[best_mode(P, *c, u, three)] for c in C])
    print(f"  gain for {u:7s}: {g:.4f}")

print("\n3. Monte Carlo check (|closed form - simulation|, 200000 draws)")
rng = np.random.default_rng(0)
worst = 0.0
for c in [(6, 0.5, 1, False), (12, 0.0, 0, True), (3, 1.0, 1, False)]:
    for u in URGENCY:
        for m in MODES:
            cf = utilities(P, *c, u)[m]
            mc = simulate_utility(P, m, *c, u, 200000, rng)
            worst = max(worst, abs(cf - mc))
print(f"  worst abs difference over 36 cases: {worst:.4f}")

print("\n4. Sensitivity of the 4-mode choice (share of (context, urgency) cells whose best mode changes)")
base = {(c, u): best_mode(P, *c, u) for c in C for u in URGENCY}
for k, v in [("chime_cost", P.chime_cost), ("chime_mask", P.chime_mask), ("react_rate", P.react_rate),
             ("look_rate", P.look_rate), ("c_speech_per_s", P.c_speech_per_s)]:
    row = []
    for f in (0.5, 2.0):
        q = with_(P, **{k: v * f})
        row.append(np.mean([best_mode(q, *c, u) != base[(c, u)] for c in C for u in URGENCY]))
    print(f"  {k:15s} x0.5: {row[0]:.2f}   x2: {row[1]:.2f}")

print("\n5. Twin gap: regret (utility per message) of choosing modes with an assumed value")
for k, assumed, trues in [("react_rate", P.react_rate, (0.1, 0.2, 1.0, 2.0)),
                          ("look_rate", P.look_rate, (0.02, 0.05, 0.2, 0.4)),
                          ("chime_mask", P.chime_mask, (0.0, 1.0))]:
    print(f"  {k} assumed {assumed}: " + ", ".join(
        f"true {t}: {regret(with_(P, **{k: t}), P, C):.4f}" for t in trues))

print("\n6. Utilities of each mode for high urgency vs react_rate (words 6, noise 0.5, others talking, eyes free)")
ctx = (6, 0.5, 1, False)
for r in (0.0, 0.02, 0.05, 0.1, 0.2, 0.5):
    q = with_(P, react_rate=r)
    print(f"  react_rate {r:4}: best={best_mode(q, *ctx, 'high')}, " +
          ", ".join(f"{m}={v:.3f}" for m, v in utilities(q, *ctx, 'high').items()))
