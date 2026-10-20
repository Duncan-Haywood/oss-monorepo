"""Does the ranking of designs survive a shift? 600 random feasible designs plus the CMA-ES optimum of the nominal
world and of a robust (mean over 10 training worlds) objective, scored in 30 held-out worlds. Writes results.txt/json."""
import json, os, sys
import numpy as np
from scipy.stats import spearmanr, qmc
import cma

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_transfer import transfer as T

N_DESIGNS, N_TRAIN, N_TEST = 600, 10, 30
TEST = [T.draw_world(1000 + i) for i in range(N_TEST)]
TRAIN = [T.draw_world(5000 + i) for i in range(N_TRAIN)]
NOMINAL = T.draw_world(0, width=0.0)
TEST_POPS = [T.population(w) for w in TEST]


def cma_opt(fun, seed, evals=240):
    es = cma.CMAEvolutionStrategy([0.5] * 5, 0.3, {"bounds": [0, 1], "seed": seed, "popsize": 8, "verbose": -9})
    best = (-9, None)
    n = 0
    while n < evals:
        xs = es.ask()
        ys = [fun(T.phys(np.array(x))) for x in xs]
        n += len(xs)
        es.tell(xs, [-y for y in ys])
        for x, y in zip(xs, ys):
            if y > best[0]:
                best = (y, T.phys(np.array(x)))
    return best[1]


def test_scores(x):
    return np.array([T.score(x, w, p) for w, p in zip(TEST, TEST_POPS)])


if __name__ == "__main__":
    U = qmc.Sobol(5, seed=1).random(2048)
    designs = []
    for u in U:
        x = T.phys(u)
        if T.A.cost_usd(x) <= T.A.COST_CAP:
            designs.append(x)
        if len(designs) == N_DESIGNS:
            break
    nom = np.array([T.score(x, NOMINAL, builds=1) for x in designs])
    shifted = np.array([test_scores(x) for x in designs])         # designs x worlds
    mean_sh, p5 = shifted.mean(1), np.percentile(shifted, 5, axis=1)
    rho_mean = spearmanr(nom, mean_sh)[0]
    per_world = [spearmanr(nom, shifted[:, j])[0] for j in range(N_TEST)]
    top = np.argsort(-nom)[: N_DESIGNS // 10]
    top_in_top = [len(set(top) & set(np.argsort(-shifted[:, j])[: N_DESIGNS // 10])) / len(top) for j in range(N_TEST)]
    best_nom = int(np.argmax(nom))
    regret = [shifted[:, j].max() - shifted[best_nom, j] for j in range(N_TEST)]

    x_nom = cma_opt(lambda x: T.score(x, NOMINAL, builds=1), 1)
    x_rob = cma_opt(lambda x: float(np.mean([T.score(x, w, builds=1) for w in TRAIN])), 2, evals=160)
    rows = []
    for name, x in (("nominal-world CMA-ES optimum", x_nom), ("robust CMA-ES optimum (mean of 10 worlds)", x_rob),
                    ("best random design in nominal world", designs[best_nom])):
        s = test_scores(x)
        rows.append((name, [round(float(v), 3) for v in x], T.score(x, NOMINAL, builds=1), s.mean(), np.percentile(s, 5), s.min()))

    lines = [f"{N_DESIGNS} random feasible designs, nominal world (codesign-agri's 600 fruit, no tolerance) vs {N_TEST} held-out shifted worlds, 3 printed copies per design per world.", "",
             f"Spearman rank correlation, nominal J vs mean J over worlds: {rho_mean:.3f}",
             f"Per-world Spearman: median {np.median(per_world):.3f}, min {min(per_world):.3f}, max {max(per_world):.3f}",
             f"Share of the nominal top 10% that is still in a world's top 10%: median {np.median(top_in_top):.2f}, min {min(top_in_top):.2f}",
             f"Designs whose J falls by more than 0.10 from nominal to the mean shifted world: {(nom - mean_sh > 0.10).mean():.2f}",
             f"Best nominal random design: nominal J {nom[best_nom]:.3f}, mean shifted J {mean_sh[best_nom]:.3f}; regret against each world's best random design: median {np.median(regret):.3f}, max {max(regret):.3f}", "",
             "design | x = [w mm, l mm, E MPa, Fg N, n] | nominal J | mean J shifted | 5th percentile | worst world"]
    for r in rows:
        lines.append(f"{r[0]} | {r[1]} | {r[2]:.3f} | {r[3]:.3f} | {r[4]:.3f} | {r[5]:.3f}")
    lines += ["", "Widening sweep (the 600 designs, scored in 10 worlds drawn at each spread width): width | Spearman vs nominal | nominal-best design's mean J"]
    sweep = []
    for width in (0.0, 0.25, 0.5, 0.75, 1.0):
        ws = [T.draw_world(9000 + i, width) for i in range(10)]
        ps = [T.population(w) for w in ws]
        m = np.array([np.mean([T.score(x, w, p) for w, p in zip(ws, ps)]) for x in designs])
        sweep.append((width, spearmanr(nom, m)[0], m[best_nom]))
        lines.append(f"{width:.2f} | {sweep[-1][1]:.3f} | {sweep[-1][2]:.3f}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"nom": nom.tolist(), "mean_shifted": mean_sh.tolist(), "p5": p5.tolist(), "sweep": sweep,
               "robust": rows[1][1], "nominal_opt": rows[0][1]}, open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
