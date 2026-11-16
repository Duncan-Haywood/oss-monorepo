"""Milestone 9: can a smarter quarter-sample survey seed as well as a census?

Milestone 5's deterministic rules (greedy searched again with the same code and seed) as the
reference set, plus survey rules under three designs (uniform, adaptive, walk) and two rankings
(top estimated degree, degree discount on the seen ties) at f in {0.1, 0.25, 0.5}, friend
nomination and random. Scored as milestone 5, except that every randomised rule's draws get
independent runs (milestone 6's correction). Plan in LOG.md (2026-11-16, milestone 9), written
before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m9_survey/run.py   (a few minutes on 4 cores)
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
            out.append(sd.rule_random(v, b, np.random.default_rng([EVAL_SEED, v.village, k])))
        elif rule == "friend":
            out.append(sd.rule_friend(v, b, r))
        else:
            design, kind, f = rule.split("-")
            fn = sd.rule_design_degree if kind == "deg" else sd.rule_design_dd
            out.append(fn(v, b, r, float(f), design))
    return np.stack(out, 1)


SHARES = (0.1, 0.25, 0.5)
RANDOMISED = ["random", "friend"] + [f"{d}-{k}-{f}" for f in SHARES
                                     for d in sd.SURVEY_DESIGNS for k in ("deg", "dd")]


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
            row[rule] = float(sd.simulate_batch(v, _BETA, D, 1, rng, independent=True, **mod)[:, 0].mean())
        out[m] = row
    return g, out, stats


def main():
    t0 = time.time()
    _init()
    V = _V
    G = len(V)
    lines = ["# Milestone 9: survey designs for seeding with a partial network survey",
             f"villages {G}, seeds {sum(int(v.leader.sum()) for v in V)} (each village's leader count); "
             f"greedy S = {S_GREEDY}; scoring S = {S_EVAL} (seed {EVAL_SEED}); randomised rules = "
             f"{S_EVAL} independent seed sets, one independent run each; bootstrap B = {B_BOOT}"]
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
    kd = rules.index("degree")
    W_ = {r: worst[rules.index(r)] for r in rules}
    def share_better(r1, r2):
        return float((worstb[rules.index(r1)] < worstb[rules.index(r2)]).mean())
    lines.append("")
    lines.append("## survey rules: worst-case regret by share, design and ranking (I, T, R)")
    for f in SHARES:
        lines.append(f"  f = {f}: " + "  ".join(f"{d}-{k} {W_[f'{d}-{k}-{f}']:.3f}"
                                            for d in sd.SURVEY_DESIGNS for k in ("deg", "dd")))
    lines.append("")
    lines.append("## paired: share of bootstrap draws where the first rule's worst case is lower")
    for f in SHARES:
        for d in ("adaptive", "walk"):
            for k in ("deg", "dd"):
                lines.append(f"  {d}-{k}-{f} vs uniform-{k}-{f}: {share_better(f'{d}-{k}-{f}', f'uniform-{k}-{f}'):.3f}")
        for d in sd.SURVEY_DESIGNS:
            lines.append(f"  {d}-dd-{f} vs {d}-deg-{f}: {share_better(f'{d}-dd-{f}', f'{d}-deg-{f}'):.3f}")
    for r in RANDOMISED[1:]:
        lines.append(f"  {r} vs census degree: {share_better(r, 'degree'):.3f}"
                     f"  vs census degree-discount: {share_better(r, 'degree-discount'):.3f}")

    ad, un = "adaptive-deg-0.25", "uniform-deg-0.25"
    h16 = W_[ad] < W_[un] and share_better(ad, un) >= 0.8
    h17 = W_["uniform-dd-0.25"] < W_[un]
    best25 = min((W_[f"{d}-{k}-0.25"], f"{d}-{k}-0.25") for d in sd.SURVEY_DESIGNS for k in ("deg", "dd"))
    h18 = best25[0] <= W_["degree"]
    lines.append("")
    lines.append(f"H16 (adaptive beats uniform at f = 0.25, top estimated degree, and in >= 80% of draws): "
                 f"{'held' if h16 else 'refuted'}; {ad} {W_[ad]:.3f} vs {un} {W_[un]:.3f}, share {share_better(ad, un):.3f}")
    lines.append(f"H17 (survey degree discount beats top estimated degree, uniform, f = 0.25): "
                 f"{'held' if h17 else 'refuted'}; uniform-dd-0.25 {W_['uniform-dd-0.25']:.3f} vs {un} {W_[un]:.3f}")
    lines.append(f"H18 (best f = 0.25 survey rule at most census top degree): {'held' if h18 else 'refuted'}; "
                 f"{best25[1]} {best25[0]:.3f} vs degree {W_['degree']:.3f}")
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
