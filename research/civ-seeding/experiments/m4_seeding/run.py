"""Milestone 4: whom should a rollout seed, under each model the data cannot reject?

Ten seeding rules (seven structural, greedy under each of the three fitted models) at the
villages' own leader budgets, each scored under the three fitted models (I, T, R-delta) and
two sensitivity points, on the 43 real BCDJ networks. Regret against the best rule per model,
village Bayesian bootstrap, Kendall tau between models' rankings. Plan in LOG.md (2026-11-14,
milestone 4), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m4_seeding/run.py   (a few minutes on 4 cores)
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, seeding as sd  # noqa: E402

S_GREEDY = 32
S_EVAL = 200
EVAL_SEED = 5
B_BOOT = 1000
FITTED = ("I", "T", "R")
EVAL_MODELS = ("I", "T", "R", "T60", "Ipub")
if os.environ.get("SMOKE"):
    S_GREEDY, S_EVAL, B_BOOT = 4, 20, 50

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _greedy(args):
    g, name = args
    v = _V[g]
    if os.environ.get("SMOKE") and g > 2:
        return g, name, sd.rule_degree(v, int(v.leader.sum()))
    return g, name, sd.rule_greedy(v, int(v.leader.sum()), _BETA, sd.MODELS[name], S=S_GREEDY)


def _evaluate(args):
    g, sets = args
    v = _V[g]
    out = {}
    for m in EVAL_MODELS:
        mod = sd.MODELS[m]
        row = {}
        for rule, mask in sets.items():
            rng = np.random.default_rng([EVAL_SEED, v.village, 13])
            if rule == "random":
                R = np.stack([sd.rule_random(v, int(v.leader.sum()),
                                             np.random.default_rng([EVAL_SEED, v.village, k]))
                              for k in range(S_EVAL)], 1)
                cnt = sd.simulate_batch(v, _BETA, R, 1, rng, **mod)[:, 0]
            else:
                cnt = sd.simulate_batch(v, _BETA, mask, S_EVAL, rng, **mod)[0]
            row[rule] = float(cnt.mean())
            if rule == "leaders":
                Y = sd.simulate_batch(v, _BETA, mask, S_EVAL, np.random.default_rng(
                    [EVAL_SEED, v.village, 13]), return_matrix=True, **mod)
                row["_nonleader_rate"] = float(Y[~v.leader].mean())
        out[m] = row
    return g, out


def main():
    t0 = time.time()
    _init()
    V = _V
    G = len(V)
    lines = ["# Milestone 4: seeding rules under each fitted model",
             f"villages {G}, seeds {sum(int(v.leader.sum()) for v in V)} (each village's leader count); "
             f"greedy S = {S_GREEDY} with common random numbers; scoring S = {S_EVAL} (seed {EVAL_SEED}); "
             f"random = {S_EVAL} independent seed sets, one run each; bootstrap B = {B_BOOT}"]
    for m in EVAL_MODELS:
        lines.append(f"model {m}: {sd.MODELS[m]}")
    jobs = [(g, f) for g in range(G) for f in FITTED]
    jobs.sort(key=lambda j: -V[j[0]].n ** 2 * V[j[0]].leader.sum() * V[j[0]].T)
    greedy = {}
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for g, name, mask in ex.map(_greedy, jobs):
            greedy[(g, name)] = mask
        lines.append(f"greedy searches done in {time.time() - t0:.0f} s")
        sets = []
        for g, v in enumerate(V):
            b = int(v.leader.sum())
            d = {r: f(v, b, np.random.default_rng([EVAL_SEED, v.village]))
                 for r, f in sd.STRUCTURAL.items()}
            for f in FITTED:
                d[f"greedy-{f}"] = greedy[(g, f)]
            sets.append((g, d))
        res = dict(ex.map(_evaluate, sets))
    rules = list(sets[0][1])
    E = {m: np.array([[res[g][m][r] for g in range(G)] for r in rules]) for m in EVAL_MODELS}
    n = np.array([v.n for v in V])

    lines.append("")
    lines.append("## sanity: leaders rule, simulated non-leader take-up (data 0.1868)")
    lines.append("  " + ", ".join(f"{m} {np.mean([res[g][m]['_nonleader_rate'] for g in range(G)]):.4f}"
                                 for m in EVAL_MODELS))

    # overlap of seed sets with the leaders and with each other
    lines.append("")
    lines.append("## seed-set overlap (share of seeds in common, pooled over villages)")
    for a in ("degree", "diffusion", "ball", "patches", "greedy-I", "greedy-T", "greedy-R"):
        ov = {c: sum((sets[g][1][a] & sets[g][1][c]).sum() for g in range(G)) /
              sum(sets[g][1][a].sum() for g in range(G))
              for c in ("leaders", "degree", "greedy-I", "greedy-T")}
        lines.append(f"  {a:12s} " + "  ".join(f"{c} {x:.2f}" for c, x in ov.items()))
    mdeg = {r: np.mean(np.concatenate([V[g].deg[sets[g][1][r]] for g in range(G)]))
            for r in rules if r != "random"}
    lines.append("  mean seed degree: " + ", ".join(f"{r} {x:.1f}" for r, x in mdeg.items())
                 + f"; all households {np.mean(np.concatenate([v.deg for v in V])):.1f}")
    # within-set ties: share of seed pairs that are neighbours
    dens = {}
    for r in rules:
        if r == "random":
            continue
        e = sum(V[g].A[np.ix_(sets[g][1][r], sets[g][1][r])].sum() / 2 for g in range(G))
        p = sum(int(sets[g][1][r].sum()) * (int(sets[g][1][r].sum()) - 1) / 2 for g in range(G))
        dens[r] = e / p
    lines.append("  tie density among seeds: " + ", ".join(f"{r} {x:.3f}" for r, x in dens.items()))

    # bootstrap weights shared across models
    W = np.random.default_rng(42).dirichlet(np.ones(G), B_BOOT) * G
    lines.append("")
    lines.append("## adopters (mean per village; share of households) and regret against the best rule")
    summary = {}
    for m in EVAL_MODELS:
        tot = E[m].sum(1)
        best = tot.max()
        reg = 1 - tot / best
        totb = E[m] @ W.T                      # rules x B
        regb = 1 - totb / totb.max(0)
        pbest = (totb == totb.max(0)).mean(1)
        lo, hi = np.percentile(regb, [5, 95], axis=1)
        lines.append(f"### model {m}: best rule {rules[int(np.argmax(tot))]}")
        for k in np.argsort(-tot):
            lines.append(f"  {rules[k]:12s} {tot[k] / G:7.2f} ({tot[k] / n.sum():.4f})  regret {reg[k]:6.3f}"
                         f"  [{lo[k]:.3f}, {hi[k]:.3f}]  best in {pbest[k]:.3f} of draws")
        summary[m] = dict(tot=tot, reg=reg, regb=regb)

    lines.append("")
    lines.append("## H4: does the policy depend on the model? (fitted models I, T, R)")
    bests = {m: rules[int(np.argmax(summary[m]['tot']))] for m in FITTED}
    taus = {}
    for i, a in enumerate(FITTED):
        for b in FITTED[i + 1:]:
            taus[(a, b)] = sd.kendall_tau(summary[a]["tot"], summary[b]["tot"])
    lines.append("  best: " + ", ".join(f"{m} {r}" for m, r in bests.items()))
    lines.append("  Kendall tau (ten rules): " + ", ".join(f"{a}-{b} {t:.3f}" for (a, b), t in taus.items()))
    # same on the seven structural rules only (greedy is model-specific)
    k7 = [rules.index(r) for r in sd.STRUCTURAL]
    lines.append("  Kendall tau (seven structural rules): " + ", ".join(
        f"{a}-{b} {sd.kendall_tau(summary[a]['tot'][k7], summary[b]['tot'][k7]):.3f}"
        for (a, b) in taus))
    h4 = len(set(bests.values())) > 1 or min(taus.values()) < 0.6
    lines.append(f"H4: {'held' if h4 else 'refuted'}")

    lines.append("")
    lines.append("## H5: is some rule within 10% of the best under every fitted model?")
    worst = np.max([summary[m]["reg"] for m in FITTED], 0)
    worstb = np.max([summary[m]["regb"] for m in FITTED], 0)
    for k in np.argsort(worst):
        lo, hi = np.percentile(worstb[k], [5, 95])
        lines.append(f"  {rules[k]:12s} worst-case regret {worst[k]:.3f}  [{lo:.3f}, {hi:.3f}]  "
                     + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in FITTED)
                     + "  |  sensitivity " + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}"
                                                       for m in EVAL_MODELS if m not in FITTED))
    mm = int(np.argmin(worst))
    share = (np.argmin(worstb, 0) == mm).mean()
    lines.append(f"minimax-regret rule: {rules[mm]} (worst-case {worst[mm]:.3f}; minimax in {share:.3f} of draws)")
    lines.append(f"H5: {'held' if worst[mm] <= 0.10 else 'refuted'}")

    lines.append("")
    lines.append("## cross-model: optimise for one model, lose under another (regret of greedy-X under Y)")
    for f in FITTED:
        k = rules.index(f"greedy-{f}")
        lines.append(f"  greedy-{f}: " + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in EVAL_MODELS))

    lines.append("")
    lines.append("## per village: share of villages where each rule is best (fitted models)")
    for m in FITTED:
        bv = np.argmax(E[m], 0)
        cnt = np.bincount(bv, minlength=len(rules))
        lines.append(f"  {m}: " + ", ".join(f"{rules[k]} {cnt[k]}" for k in np.argsort(-cnt) if cnt[k]))
    lines.append(f"runtime {time.time() - t0:.0f} s")
    out = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "results.txt" if not os.environ.get("SMOKE") else "smoke.txt"), "w").write(out)
    json.dump({"rules": rules, "models": list(EVAL_MODELS),
               "regret": {m: summary[m]["reg"].round(5).tolist() for m in EVAL_MODELS},
               "adopters_per_village": {m: (summary[m]["tot"] / G).round(4).tolist() for m in EVAL_MODELS}},
              open(os.path.join(HERE, "regret.json" if not os.environ.get("SMOKE") else "smoke.json"), "w"),
              indent=1)
    print(out)


if __name__ == "__main__":
    main()
