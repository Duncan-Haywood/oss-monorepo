"""Milestone 5: can a rule without a fitted model, or without a full network census, seed as
well as greedy?

All milestone-4 rules (greedy searched again with the same code and seed), plus three census
rules that need no model (spread degree, single discount, degree discount) and survey rules
that see only a random share f of households' ties (top estimated degree, spread degree on
the seen ties) and friend nomination. Scored exactly as milestone 4. Plan in LOG.md
(2026-11-15, milestone 5), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m5_cheap/run.py   (a few minutes on 4 cores)
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
SMOKE = bool(os.environ.get("SMOKE"))
if SMOKE:
    S_GREEDY, S_EVAL, B_BOOT = 4, 20, 50

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


def _draws(v, b, rule):
    """S_EVAL independent seed sets for a randomised rule (one run each)."""
    out = []
    for k in range(S_EVAL):
        r = np.random.default_rng([EVAL_SEED, v.village, k, 7])
        if rule == "random":
            # milestone 4's streams, so its random row is reproduced
            out.append(sd.rule_random(v, b, np.random.default_rng([EVAL_SEED, v.village, k])))
        elif rule == "friend":
            out.append(sd.rule_friend(v, b, r))
        else:
            kind, f = rule.rsplit("-", 1)
            fn = sd.rule_survey_degree if kind == "survey-degree" else sd.rule_survey_spread
            out.append(fn(v, b, r, float(f)))
    return np.stack(out, 1)


RANDOMISED = ["random", "friend"] + [f"{k}-{f}" for f in sd.SURVEY_SHARES
                                     for k in ("survey-degree", "survey-spread")]


def _evaluate(args):
    g, sets = args
    v = _V[g]
    b = int(v.leader.sum())
    draws = {r: _draws(v, b, r) for r in RANDOMISED}
    out = {}
    stats = {}
    for r, D in draws.items():
        stats[r] = dict(deg=float((v.deg[:, None] * D).sum() / D.sum()),
                        ties=float(np.einsum("ik,ij,jk->", D, v.A, D) / 2),
                        pairs=float(S_EVAL * b * (b - 1) / 2))
    for m in EVAL_MODELS:
        mod = sd.MODELS[m]
        row = {}
        for rule, mask in sets.items():
            rng = np.random.default_rng([EVAL_SEED, v.village, 13])
            row[rule] = float(sd.simulate_batch(v, _BETA, mask, S_EVAL, rng, **mod)[0].mean())
        for rule, D in draws.items():
            rng = np.random.default_rng([EVAL_SEED, v.village, 13])
            row[rule] = float(sd.simulate_batch(v, _BETA, D, 1, rng, **mod)[:, 0].mean())
        out[m] = row
    return g, out, stats


def main():
    t0 = time.time()
    _init()
    V = _V
    G = len(V)
    lines = ["# Milestone 5: cheap and survey-based seeding rules against greedy",
             f"villages {G}, seeds {sum(int(v.leader.sum()) for v in V)} (each village's leader count); "
             f"greedy S = {S_GREEDY}; scoring S = {S_EVAL} (seed {EVAL_SEED}); randomised rules = "
             f"{S_EVAL} independent seed sets, one run each; bootstrap B = {B_BOOT}"]
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
            d = {r: f(v, b, None) for r, f in sd.STRUCTURAL.items() if r != "random"}
            d.update({r: f(v, b) for r, f in sd.CENSUS_CHEAP.items()})
            for f in FITTED:
                d[f"greedy-{f}"] = greedy[(g, f)]
            sets.append((g, d))
        res, stats = {}, {}
        for g, o, st in ex.map(_evaluate, sets):
            res[g], stats[g] = o, st
    rules = list(sets[0][1]) + RANDOMISED
    E = {m: np.array([[res[g][m][r] for g in range(G)] for r in rules]) for m in EVAL_MODELS}
    n = np.array([v.n for v in V])

    lines.append("")
    lines.append("## seed-set shape (pooled over villages): mean seed degree, tie density among seeds, overlap with greedy-T")
    for r in rules:
        if r in RANDOMISED:
            deg = np.mean([stats[g][r]["deg"] for g in range(G)])
            dens = sum(stats[g][r]["ties"] for g in range(G)) / sum(stats[g][r]["pairs"] for g in range(G))
            lines.append(f"  {r:18s} degree {deg:5.1f}  tie density {dens:.3f}  (mean over draws)")
            continue
        S_ = [sets[g][1][r] for g in range(G)]
        deg = np.mean(np.concatenate([V[g].deg[S_[g]] for g in range(G)]))
        e = sum(V[g].A[np.ix_(S_[g], S_[g])].sum() / 2 for g in range(G))
        p = sum(int(S_[g].sum()) * (int(S_[g].sum()) - 1) / 2 for g in range(G))
        ov = sum((S_[g] & sets[g][1]["greedy-T"]).sum() for g in range(G)) / sum(S_[g].sum() for g in range(G))
        lines.append(f"  {r:18s} degree {deg:5.1f}  tie density {e / p:.3f}  overlap greedy-T {ov:.2f}")
    adj = sum(int(V[g].A[np.ix_(sets[g][1]['spread-degree'], sets[g][1]['spread-degree'])].sum() > 0) for g in range(G))
    lines.append(f"  villages where spread degree had to seat adjacent seeds: {adj} of {G}")

    W = np.random.default_rng(42).dirichlet(np.ones(G), B_BOOT) * G
    lines.append("")
    lines.append("## adopters (mean per village; share of households) and regret against the best rule")
    summary = {}
    for m in EVAL_MODELS:
        tot = E[m].sum(1)
        reg = 1 - tot / tot.max()
        totb = E[m] @ W.T
        regb = 1 - totb / totb.max(0)
        lo, hi = np.percentile(regb, [5, 95], axis=1)
        lines.append(f"### model {m}: best rule {rules[int(np.argmax(tot))]}")
        for k in np.argsort(-tot):
            lines.append(f"  {rules[k]:18s} {tot[k] / G:7.2f} ({tot[k] / n.sum():.4f})  regret {reg[k]:6.3f}"
                         f"  [{lo[k]:.3f}, {hi[k]:.3f}]")
        summary[m] = dict(tot=tot, reg=reg, regb=regb)

    lines.append("")
    lines.append("## worst-case regret over the fitted models I, T, R (sensitivity T60, Ipub after the bar)")
    worst = np.max([summary[m]["reg"] for m in FITTED], 0)
    worstb = np.max([summary[m]["regb"] for m in FITTED], 0)
    wci = {}
    for k in np.argsort(worst):
        lo, hi = np.percentile(worstb[k], [5, 95])
        wci[rules[k]] = (float(lo), float(hi))
        lines.append(f"  {rules[k]:18s} worst {worst[k]:.3f}  [{lo:.3f}, {hi:.3f}]  "
                     + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in FITTED)
                     + "  |  " + "  ".join(f"{m} {summary[m]['reg'][k]:.3f}" for m in EVAL_MODELS if m not in FITTED))
    # paired: cheap rule against top degree, bootstrap share of draws where it is better under all three
    lines.append("")
    lines.append("## paired against top degree: share of bootstrap draws where the rule's worst-case regret is lower")
    kd = rules.index("degree")
    for r in list(sd.CENSUS_CHEAP) + RANDOMISED[1:]:
        k = rules.index(r)
        lines.append(f"  {r:18s} {(worstb[k] < worstb[kd]).mean():.3f}")

    cheap_w = {r: worst[rules.index(r)] for r in sd.CENSUS_CHEAP}
    h6 = min(cheap_w.values()) <= 0.02
    lines.append("")
    lines.append(f"H6 (a census rule without a model within 2% everywhere): {'held' if h6 else 'refuted'}; "
                 + ", ".join(f"{r} {x:.3f}" for r, x in cheap_w.items()))
    s25 = {r: worst[rules.index(r)] for r in ("survey-degree-0.25", "survey-spread-0.25")}
    h7a = min(s25.values()) <= 0.05
    kf, kr = rules.index("friend"), rules.index("random")
    h7b = all(summary[m]["tot"][kf] > summary[m]["tot"][kr] for m in FITTED)
    lines.append(f"H7a (f = 0.25 survey rule within 5% everywhere): {'held' if h7a else 'refuted'}; "
                 + ", ".join(f"{r} {x:.3f}" for r, x in s25.items()))
    lines.append(f"H7b (friend nomination beats random under I, T, R): {'held' if h7b else 'refuted'}; "
                 + ", ".join(f"{m} friend {summary[m]['tot'][kf] / G:.2f} vs random {summary[m]['tot'][kr] / G:.2f}"
                             for m in FITTED))
    lines.append(f"runtime {time.time() - t0:.0f} s")
    out = "\n".join(lines) + "\n"
    open(os.path.join(HERE, "smoke.txt" if SMOKE else "results.txt"), "w").write(out)
    json.dump({"rules": rules, "models": list(EVAL_MODELS),
               "regret": {m: summary[m]["reg"].round(5).tolist() for m in EVAL_MODELS},
               "worst": worst.round(5).tolist(), "worst_ci90": [wci[r] for r in rules],
               "adopters_per_village": {m: (summary[m]["tot"] / G).round(4).tolist() for m in EVAL_MODELS}},
              open(os.path.join(HERE, "smoke.json" if SMOKE else "regret.json"), "w"), indent=1)
    print(out)


if __name__ == "__main__":
    main()
