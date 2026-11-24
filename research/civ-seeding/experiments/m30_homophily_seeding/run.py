"""Milestone 30: does the seeding advice survive homophily, the explanation the real villages
now prefer (milestone 29)?

Fifteen rules (milestone 4's seven structural rules, milestone 5's three census rules without a
model, greedy under each of I, T, R, H, L) at each village's leader budget, scored under the
milestone-4 fits I, T, R, milestone 29's real-data fits H and L, and two L sensitivity points
(Ls1: sigma 1.0; Lr2: rho 2). Regret against the best rule per process, village Bayesian
bootstrap, Kendall tau between processes' rankings. Plan and hypotheses H110 to H115 in LOG.md
(2026-11-24, milestone 30), written before the run.

OMP_NUM_THREADS=1 python3 experiments/m30_homophily_seeding/run.py   (about 10 minutes on 4 cores)
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
FITTED = ("I", "T", "R", "H", "L")
EVAL_MODELS = ("I", "T", "R", "H", "L", "Ls1", "Lr2")
SMOKE = bool(os.environ.get("SMOKE"))
if SMOKE:
    S_GREEDY, S_EVAL, B_BOOT = 4, 20, 50

# milestone 4 (regret, 10 rules) and milestone 5 (degree-discount) under I, T, R, for H110
M4 = {"I": {"greedy-I": 0.000, "greedy-R": 0.003, "greedy-T": 0.005, "patches": 0.028,
            "degree": 0.032, "diffusion": 0.053, "leaders": 0.062, "eigenvector": 0.067,
            "random": 0.069, "ball": 0.071}}
M5_DD = {"I": 0.014, "T": 0.008, "R": 0.000}
DATA_NONLEADER = 0.1868

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def _greedy(args):
    g, name = args
    v = _V[g]
    if SMOKE and g > 2:
        return g, name, sd.rule_degree(v, int(v.leader.sum()))
    return g, name, sd.rule_greedy(v, int(v.leader.sum()), _BETA, sd.MODELS[name], S=S_GREEDY)


def _evaluate(args):
    g, sets = args
    v = _V[g]
    b = int(v.leader.sum())
    out = {}
    for m in EVAL_MODELS:
        mod = sd.MODELS[m]
        row = {}
        for rule, mask in sets.items():
            rng = np.random.default_rng([EVAL_SEED, v.village, 13])
            if rule == "random":
                R = np.stack([sd.rule_random(v, b, np.random.default_rng([EVAL_SEED, v.village, k]))
                              for k in range(S_EVAL)], 1)
                # as the plan says: 200 independent seed sets, each on its own random draws.
                # Milestone 4's harness shared one draw across all 200 sets (one latent field
                # per village under L); that score is kept only for H110's reproduction check.
                cnt = sd.simulate_batch(v, _BETA, R, 1, rng, independent=True, **mod)[:, 0]
                row["_random_m4"] = float(sd.simulate_batch(
                    v, _BETA, R, 1, np.random.default_rng([EVAL_SEED, v.village, 13]),
                    **mod)[:, 0].mean())
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
    lines = ["# Milestone 30: seeding rules under the contagion fits and the homophily fit",
             f"villages {G}, seeds {sum(int(v.leader.sum()) for v in V)} (each village's leader count); "
             f"greedy S = {S_GREEDY} with common random numbers; scoring S = {S_EVAL} (seed {EVAL_SEED}); "
             f"random = {S_EVAL} independent seed sets, one run each; bootstrap B = {B_BOOT}"]
    for m in EVAL_MODELS:
        lines.append(f"process {m}: {sd.MODELS[m]}")
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
            for r, f in sd.CENSUS_CHEAP.items():
                d[r] = f(v, b)
            for f in FITTED:
                d[f"greedy-{f}"] = greedy[(g, f)]
            sets.append((g, d))
        res = dict(ex.map(_evaluate, sets))
    rules = list(sets[0][1])
    E = {m: np.array([[res[g][m][r] for g in range(G)] for r in rules]) for m in EVAL_MODELS}
    n = np.array([v.n for v in V])

    lines.append("")
    lines.append(f"## sanity: leaders rule, simulated non-leader take-up (data {DATA_NONLEADER})")
    nl = {m: float(np.mean([res[g][m]["_nonleader_rate"] for g in range(G)])) for m in EVAL_MODELS}
    lines.append("  " + ", ".join(f"{m} {x:.4f}" for m, x in nl.items()))

    mdeg = {r: np.mean(np.concatenate([V[g].deg[sets[g][1][r]] for g in range(G)]))
            for r in rules if r != "random"}
    lines.append("  mean seed degree: " + ", ".join(f"{r} {x:.1f}" for r, x in mdeg.items()))
    ov = {f: sum((sets[g][1]["greedy-L"] & sets[g][1][f"greedy-{f}"]).sum() for g in range(G)) /
          sum(sets[g][1]["greedy-L"].sum() for g in range(G)) for f in FITTED}
    lines.append("  greedy-L seed overlap: " + ", ".join(f"greedy-{f} {x:.2f}" for f, x in ov.items())
                 + f", degree-discount {sum((sets[g][1]['greedy-L'] & sets[g][1]['degree-discount']).sum() for g in range(G)) / sum(sets[g][1]['greedy-L'].sum() for g in range(G)):.2f}")

    W = np.random.default_rng(42).dirichlet(np.ones(G), B_BOOT) * G
    lines.append("")
    lines.append("## adopters (mean per village; share of households) and regret against the best rule")
    summary = {}
    for m in EVAL_MODELS:
        tot = E[m].sum(1)
        best = tot.max()
        reg = 1 - tot / best
        totb = E[m] @ W.T
        regb = 1 - totb / totb.max(0)
        lo, hi = np.percentile(regb, [5, 95], axis=1)
        lines.append(f"### process {m}: best rule {rules[int(np.argmax(tot))]}")
        for k in np.argsort(-tot):
            lines.append(f"  {rules[k]:16s} {tot[k] / G:7.2f} ({tot[k] / n.sum():.4f})  regret {reg[k]:6.3f}"
                         f"  [{lo[k]:.3f}, {hi[k]:.3f}]")
        summary[m] = dict(tot=tot, reg=reg, regb=regb, totb=totb)

    # payoff of choosing seeds: best rule minus leaders, and best minus random
    lines.append("")
    lines.append("## payoff of choosing seeds (adopters per village over the leaders rule / over random seeds)")
    kl, kr = rules.index("leaders"), rules.index("random")
    gain = {}
    for m in EVAL_MODELS:
        tot = summary[m]["tot"]
        gain[m] = (tot.max() - tot[kl]) / G
        lines.append(f"  {m:4s} best - leaders {gain[m]:5.2f} ({(tot.max() / tot[kl] - 1):.3f})   "
                     f"best - random {(tot.max() - tot[kr]) / G:5.2f} ({(tot.max() / tot[kr] - 1):.3f})")
    gb = {m: (summary[m]["totb"].max(0) - summary[m]["totb"][kl]) / G for m in ("I", "L", "Ls1", "Lr2")}
    ratio_b = gb["L"] / gb["I"]
    lines.append(f"  ratio L / I of the gain over leaders: {gain['L'] / gain['I']:.3f}  "
                 f"[bootstrap 5-95% {np.percentile(ratio_b, 5):.3f}, {np.percentile(ratio_b, 95):.3f}]; "
                 f"Ls1 / I {gain['Ls1'] / gain['I']:.3f}, Lr2 / I {gain['Lr2'] / gain['I']:.3f}")

    def minimax(models):
        worst = np.max([summary[m]["reg"] for m in models], 0)
        worstb = np.max([summary[m]["regb"] for m in models], 0)
        return worst, worstb

    lines.append("")
    lines.append("## worst-case regret over the five fitted families {I, T, R, H, L} (and over I, T, R as in milestones 4 to 5)")
    worst5, worst5b = minimax(FITTED)
    worst3, _ = minimax(("I", "T", "R"))
    for k in np.argsort(worst5):
        lo, hi = np.percentile(worst5b[k], [5, 95])
        lines.append(f"  {rules[k]:16s} worst5 {worst5[k]:.3f} [{lo:.3f}, {hi:.3f}]  worst3 {worst3[k]:.3f}  "
                     + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in EVAL_MODELS))
    mm = {}
    for label, models in (("L", FITTED), ("Ls1", ("I", "T", "R", "H", "Ls1")),
                          ("Lr2", ("I", "T", "R", "H", "Lr2"))):
        w, wb = minimax(models)
        k = int(np.argmin(w))
        mm[label] = rules[k]
        share = (np.argmin(wb, 0) == k).mean()
        lines.append(f"  minimax-regret rule over I, T, R, H, {label}: {rules[k]} (worst {w[k]:.3f}; "
                     f"minimax in {share:.3f} of draws)")

    lines.append("")
    lines.append("## cross-process: greedy-X scored under Y (regret)")
    for f in FITTED:
        k = rules.index(f"greedy-{f}")
        lines.append(f"  greedy-{f}: " + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in EVAL_MODELS))

    lines.append("")
    lines.append("## Kendall tau between processes' rankings of the 15 rules")
    for a in ("I", "T", "R", "H"):
        lines.append(f"  L-{a} {sd.kendall_tau(summary['L']['tot'], summary[a]['tot']):.3f}")
    tauLI = sd.kendall_tau(summary["L"]["tot"], summary["I"]["tot"])

    # hypotheses
    lines.append("")
    lines.append("## hypotheses")
    # milestone-4 regrets are against the best of its 10 rules; recompute that way for the check
    k10 = [rules.index(r) for r in M4["I"]]
    reg10 = {}
    for m in ("I", "T", "R"):
        tot = summary[m]["tot"][k10]
        reg10[m] = dict(zip(M4["I"], 1 - tot / tot.max()))
    # random as milestone 4 scored it (shared draws), for the reproduction check only
    rm4 = np.array([res[g]["I"]["_random_m4"] for g in range(G)]).sum()
    tot10 = summary["I"]["tot"][k10].copy()
    tot10[list(M4["I"]).index("random")] = rm4
    reg10["I"] = dict(zip(M4["I"], 1 - tot10 / tot10.max()))
    d4 = max(abs(reg10["I"][r] - x) for r, x in M4["I"].items())
    lines.append("random scored as milestone 4 did (one shared draw for all 200 sets), adopters per village: "
                 + ", ".join(f"{m} {np.mean([res[g][m]['_random_m4'] for g in range(G)]):.2f}" for m in EVAL_MODELS))
    kdd = rules.index("degree-discount")
    k11 = k10 + [kdd]
    dd11 = {m: 1 - summary[m]["tot"][kdd] / summary[m]["tot"][k11].max() for m in ("I", "T", "R")}
    d5 = max(abs(dd11[m] - x) for m, x in M5_DD.items())
    s_nl = max(abs(nl[m] - DATA_NONLEADER) for m in ("H", "L"))
    h110 = d4 <= 0.0015 and d5 <= 0.003 and s_nl <= 0.02
    lines.append(f"H110 (sanity: m4 regrets under I to 0.001: max diff {d4:.4f}; dd vs m5 to 0.003: "
                 f"{', '.join(f'{m} {x:.3f}' for m, x in dd11.items())}, max diff {d5:.4f}; "
                 f"leaders non-leader take-up H {nl['H']:.4f}, L {nl['L']:.4f}, max diff {s_nl:.4f}) -> "
                 f"{'held' if h110 else 'refuted'}")
    ratio = gain["L"] / gain["I"]
    lines.append(f"H111 (gain over leaders under L <= 0.75 x under I): {ratio:.3f} -> "
                 f"{'held' if ratio <= 0.75 else 'refuted'}")
    w95 = np.percentile(worst5b[kdd], 95)
    lines.append(f"H112 (degree-discount worst over I,T,R,H,L <= 0.020 and bootstrap 95th <= 0.030): "
                 f"{worst5[kdd]:.3f}, {w95:.3f} -> {'held' if worst5[kdd] <= 0.02 and w95 <= 0.03 else 'refuted'}")
    gIL = summary["L"]["reg"][rules.index("greedy-I")]
    lines.append(f"H113 (greedy-I regret under L <= 0.010): {gIL:.3f} -> {'held' if gIL <= 0.01 else 'refuted'}")
    lines.append(f"H114 (Kendall tau L-I over 15 rules >= 0.8): {tauLI:.3f} -> {'held' if tauLI >= 0.8 else 'refuted'}")
    same = mm["L"] == mm["Ls1"] == mm["Lr2"]
    lines.append(f"H115 (minimax rule unchanged with Ls1, Lr2 in place of L): {mm} -> {'held' if same else 'refuted'}")
    lines.append(f"runtime {time.time() - t0:.0f} s")
    out = "\n".join(lines) + "\n"
    name = "smoke" if SMOKE else "results"
    open(os.path.join(HERE, f"{name}.txt"), "w").write(out)
    json.dump({"rules": rules, "processes": list(EVAL_MODELS),
               "regret": {m: summary[m]["reg"].round(5).tolist() for m in EVAL_MODELS},
               "adopters_per_village": {m: (summary[m]["tot"] / G).round(4).tolist() for m in EVAL_MODELS},
               "worst5": worst5.round(5).tolist()},
              open(os.path.join(HERE, f"{name}.json"), "w"), indent=1)
    print(out)


if __name__ == "__main__":
    main()
