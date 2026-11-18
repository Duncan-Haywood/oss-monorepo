"""Milestone 6: do the robust seeding rules stay robust when the fitted parameters are uncertain?

1. Simulate the milestone-3b grid restricted to sigma in {0, 0.25, 0.5, 0.75} (one seed) and
   compute the nine-moment divergences with the milestone-3b code.
2. Joint village Bayesian bootstrap: each draw refits I, T and R with its Dirichlet weights.
3. Score every rule under every distinct refitted process (and the point fits), S = 100 runs
   per village, and compute each draw's regret with the same weights.
Plan in LOG.md (2026-11-15, milestone 6), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m6_uncertainty/run.py   (tens of minutes on 4 cores)
"""
import importlib.util
import itertools
import json
import os
import sys
import time
import zlib
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, complex as cx, seeding as sd  # noqa: E402

_spec = importlib.util.spec_from_file_location("m3b", os.path.join(HERE, "..", "m3b_hetero", "run.py"))
m3b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m3b)
m3b.SEEDS = (0,)

SMOKE = bool(os.environ.get("SMOKE"))
S_FIT, S_EVAL, S_GREEDY, EVAL_SEED, B_BOOT, N_RAND = 75, 100, 32, 5, 500, 100
QN, QP, THETA, GAMMA, DELTA = m3b.QN, m3b.QP, m3b.THETA, m3b.GAMMA, m3b.DELTA
SIGMA = [0.0, 0.25, 0.5, 0.75]
if SMOKE:
    S_FIT, S_EVAL, S_GREEDY, B_BOOT, N_RAND = 10, 10, 4, 20, 10
    QN, QP, THETA, GAMMA, SIGMA = [0.05, 0.075, 0.1], [0.1, 0.3], [0.5], [0.1], [0.0, 0.25]
POINTS = ([("I", a, b, 0.0, d, None, s) for a, b, d, s in itertools.product(QN, QP, DELTA, SIGMA)]
          + [("T", a, b, 0.0, d, t, s)
             for a, b, t, d, s in itertools.product(QN, QP, THETA, DELTA, SIGMA)]
          + [("R", a, b, g, d, None, s)
             for a, b, g, d, s in itertools.product(QN, QP, GAMMA, DELTA, SIGMA)])
FAMS = ("I", "T", "R")
FIDX = {f: np.array([i for i, p in enumerate(POINTS) if p[0] == f]) for f in FAMS}
P_GRID = (0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3)
RANDOMISED = ("random", "friend", "survey-degree-0.25", "survey-spread-0.25")
# milestone 8 reuses this run with extra deterministic rules and its own output directory
EXTRA_RULES = {}
OUT_DIR = HERE
# milestone 10 adds randomised rules: name -> fn(v, b, rng), N_RAND draws each, scored like RANDOMISED
EXTRA_RANDOMISED = {}
# milestone 13: each extra randomised rule scored on its own stream, keyed by its name, so adding or
# removing rules re-draws no other rule. A name ending in "#r<j>" is replicate j of the rule before
# the "#": its surveys and its scoring runs are drawn afresh. False keeps milestones 10-12's shared stream.
PER_RULE_STREAMS = False
# milestone 13: rules scored but left out of the best-rule reference (replicates)
NOT_IN_REFERENCE = set()


def rule_key(name):
    """Stable 32-bit key of a rule name (crc32), for its own random stream."""
    return zlib.crc32(name.encode())


def replicate_of(name):
    """(base name, replicate index); index 0 for a rule that is not a replicate."""
    if "#r" in name:
        base, j = name.rsplit("#r", 1)
        return base, int(j)
    return name, 0


def rand_names():
    return tuple(RANDOMISED) + tuple(EXTRA_RANDOMISED)

_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def model_of(k):
    f, a, b, g, d, t, s = POINTS[k]
    return dict(qN=a, qP=b, gamma=g, delta=d, theta=t), s


def label(k):
    f, a, b, g, d, t, s = POINTS[k]
    x = f"{f} qN={a:.3f} qP={b:.1f} delta={d:+.2f} sigma={s:.2f}"
    return x + (f" theta={t:.2f}" if f == "T" else "") + (f" gamma={g:.2f}" if f == "R" else "")


def _fit_job(k):
    mod, s = model_of(k)
    Mm = np.zeros((len(_V), 9))
    pbar = []
    for j, v in enumerate(_V):
        rng = np.random.default_rng([0, v.village])
        Y = cx.simulate(v, _BETA, mod["qN"], mod["qP"], S_FIT, rng, gamma=mod["gamma"],
                        theta=mod["theta"], delta=mod["delta"],
                        shift=s * m3b.zdraw(0, v.village, S_FIT))
        Mm[j] = m3b.moments9(v, Y).mean(0)
        pbar.append(Y.mean(1))
    return k, Mm, np.concatenate(pbar).astype(np.float32)


def _greedy(args):
    g, fam, mod = args
    v = _V[g]
    if SMOKE and g > 2:
        return g, fam, sd.rule_degree(v, int(v.leader.sum()))
    return g, fam, sd.rule_greedy(v, int(v.leader.sum()), _BETA, mod, S=S_GREEDY)


def rand_sets(v, b):
    out = {}
    for rule in rand_names():
        D = []
        for k in range(N_RAND):
            r = np.random.default_rng([EVAL_SEED, v.village, k, 7])
            if rule in EXTRA_RANDOMISED:
                j = replicate_of(rule)[1] if PER_RULE_STREAMS else 0
                if j:
                    r = np.random.default_rng([EVAL_SEED, v.village, k, 7, j])
                D.append(EXTRA_RANDOMISED[rule](v, b, r))
            elif rule == "random":
                D.append(sd.rule_random(v, b, np.random.default_rng([EVAL_SEED, v.village, k])))
            elif rule == "friend":
                D.append(sd.rule_friend(v, b, r))
            elif rule.startswith("survey-degree"):
                D.append(sd.rule_survey_degree(v, b, r, 0.25))
            else:
                D.append(sd.rule_survey_spread(v, b, r, 0.25))
        out[rule] = np.stack(D, 1)
    return out


def _score(args):
    """Mean adopters of every rule in village g under each listed grid point."""
    g, det, ks = args
    v = _V[g]
    b = int(v.leader.sum())
    rs = rand_sets(v, b)
    X = np.stack(list(det.values()), 1)
    R = np.concatenate([rs[r] for r in RANDOMISED], 1)
    RX = np.concatenate([rs[r] for r in EXTRA_RANDOMISED], 1) if EXTRA_RANDOMISED else None
    out = {}
    for k in ks:
        mod, s = model_of(k)
        z = m3b.zdraw(EVAL_SEED, v.village, S_EVAL) * s if s else None
        e = sd.simulate_batch(v, _BETA, X, S_EVAL, np.random.default_rng([EVAL_SEED, v.village, 13]),
                              shift=z, **mod).mean(1)
        zr = m3b.zdraw(EVAL_SEED + 1, v.village, R.shape[1]) * s if s else None
        er = sd.simulate_batch(v, _BETA, R, 1, np.random.default_rng([EVAL_SEED, v.village, 17]),
                               shift=zr, independent=True, **mod)[:, 0].reshape(len(RANDOMISED), N_RAND).mean(1)
        parts = [e, er]
        if RX is not None and PER_RULE_STREAMS:
            ex_ = []
            for i, rule in enumerate(EXTRA_RANDOMISED):
                key = rule_key(rule)
                zx = np.random.default_rng([EVAL_SEED + 2, v.village, 7, key]).standard_normal(N_RAND) * s if s else None
                ex_.append(sd.simulate_batch(v, _BETA, RX[:, i * N_RAND:(i + 1) * N_RAND], 1,
                                             np.random.default_rng([EVAL_SEED, v.village, 19, key]),
                                             shift=zx, independent=True, **mod)[:, 0].mean())
            parts.append(np.array(ex_))
        elif RX is not None:  # own streams, so milestone 6's rows are untouched by the extra rules
            zx = m3b.zdraw(EVAL_SEED + 2, v.village, RX.shape[1]) * s if s else None
            ex_ = sd.simulate_batch(v, _BETA, RX, 1, np.random.default_rng([EVAL_SEED, v.village, 19]),
                                    shift=zx, independent=True, **mod)[:, 0]
            parts.append(ex_.reshape(len(EXTRA_RANDOMISED), N_RAND).mean(1))
        out[k] = np.concatenate(parts)
    return g, out


def main():
    t0 = time.time()
    _init()
    V, G = _V, len(_V)
    lines = []
    p = lines.append
    p("# Milestone 6: seeding regret under parameter uncertainty")
    p(f"grid {len(POINTS)} points ({', '.join(f'{f} {len(FIDX[f])}' for f in FAMS)}), sigma in {SIGMA}, "
      f"S_fit {S_FIT} (seed 0); bootstrap B = {B_BOOT} (seed 42); scoring S = {S_EVAL} (seed {EVAL_SEED}); "
      f"randomised rules {N_RAND} draws, one run each; greedy S = {S_GREEDY} at the point fits")
    offs = np.r_[0, np.cumsum([v.n for v in V])]
    Msim = np.zeros((len(POINTS), G, 9))
    pb = np.zeros((len(POINTS), offs[-1]), np.float32)
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        for k, Mm, pbar in ex.map(_fit_job, range(len(POINTS)), chunksize=8):
            Msim[k], pb[k] = Mm, pbar
        p(f"grid simulated in {time.time() - t0:.0f} s")
        Pbar = {0: [pb[:, offs[g]:offs[g + 1]].astype(float) for g in range(G)]}
        D = next(m3b.divergences(V, {0: Msim}, Pbar, [v.takeup.astype(float)[:, None] for v in V]))[0]
        del pb, Pbar
        D = D[:, :, :9]

        W = np.random.default_rng(42).dirichlet(np.ones(G), B_BOOT)        # B x G, rows sum to 1
        def argfit(w):
            Q = ((np.einsum("g,pgm->pm", w, D)) ** 2).sum(-1)
            return {f: int(FIDX[f][np.argmin(Q[FIDX[f]])]) for f in FAMS}
        point = argfit(np.ones(G) / G)
        draws = [argfit(w) for w in W]
        p("\n## point fits (sanity: milestone 3b found I qN 0.05 qP 0.3 delta 0; "
          "T theta 0.5 delta -0.25 qN 0.075 qP 0.1; R gamma 0.1 delta -0.25 qN 0.1 qP 0.1; all sigma 0)")
        for f in FAMS:
            p(f"  {label(point[f])}")
        p("\n## bootstrap distribution of the refitted point (share of draws)")
        for f in FAMS:
            ks, c = np.unique([d[f] for d in draws], return_counts=True)
            order = np.argsort(-c)
            p(f"### {f}: {len(ks)} distinct points; point fit in {np.mean([d[f] == point[f] for d in draws]):.3f} of draws")
            for j in order[:12]:
                p(f"  {c[j] / B_BOOT:.3f}  {label(ks[j])}")
            for name, col in (("sigma", 6), ("qN", 1), ("qP", 2), ("delta", 4)) + ((("theta", 5),) if f == "T" else ()) + ((("gamma", 3),) if f == "R" else ()):
                vals = np.array([POINTS[d[f]][col] for d in draws], float)
                u, cc = np.unique(vals, return_counts=True)
                p(f"    {name}: " + ", ".join(f"{a:g} {b / B_BOOT:.2f}" for a, b in zip(u, cc)))

        jobs = [(g, f, model_of(point[f])[0]) for g in range(G) for f in FAMS]
        jobs.sort(key=lambda j: -V[j[0]].n ** 2 * V[j[0]].leader.sum() * V[j[0]].T)
        greedy = {(g, f): m for g, f, m in ex.map(_greedy, jobs)}
        p(f"\ngreedy searches done at {time.time() - t0:.0f} s")
        det_sets = []
        for g, v in enumerate(V):
            b = int(v.leader.sum())
            d = {r: fn(v, b, None) for r, fn in sd.STRUCTURAL.items() if r != "random"}
            d["spread-degree"] = sd.rule_spread_degree(v, b)
            d["single-discount"] = sd.rule_single_discount(v, b)
            for q in P_GRID:
                d[f"dd-{q:g}"] = sd.rule_degree_discount(v, b, p=q)
            for f in FAMS:
                d[f"greedy-{f}"] = greedy[(g, f)]
            for r, fn in EXTRA_RULES.items():
                d[r] = fn(v, b, None)
            det_sets.append(d)
        rules = list(det_sets[0]) + list(rand_names())
        ks = sorted(set(point.values()) | {d[f] for d in draws for f in FAMS})
        p(f"scoring {len(rules)} rules under {len(ks)} distinct processes")
        E = {k: np.zeros((len(rules), G)) for k in ks}
        for g, out in ex.map(_score, [(g, det_sets[g], ks) for g in range(G)]):
            for k, e in out.items():
                E[k][:, g] = e
    p(f"scored at {time.time() - t0:.0f} s")

    def regrets(pick):
        """B x F x rules regret, each draw scored under pick(draw index, family) with its weights."""
        out = np.zeros((B_BOOT, len(FAMS), len(rules)))
        for bi in range(B_BOOT):
            for fi, f in enumerate(FAMS):
                tot = E[pick(bi, f)] @ W[bi]
                out[bi, fi] = 1 - tot / tot[ref].max()
        return out
    ref = np.array([r not in NOT_IN_REFERENCE for r in rules])
    joint = regrets(lambda bi, f: draws[bi][f])
    fixed = regrets(lambda bi, f: point[f])
    wj, wf = joint.max(1), fixed.max(1)
    n = np.array([v.n for v in V])
    full = {f: E[point[f]].sum(1) for f in FAMS}
    reg0 = {f: 1 - full[f] / full[f][ref].max() for f in FAMS}
    worst0 = np.max([reg0[f] for f in FAMS], 0)

    p("\n## sanity: point fits, equal weights (milestone 5 at S = 200: greedy-T 0.005, dd-0.05 0.014, degree 0.041)")
    p("\n## worst-case regret over I, T, R: point fits | joint bootstrap (median [5%, 95%]) | fixed fits, same weights")
    for k in np.argsort(np.median(wj, 0)):
        a, lo, hi = np.percentile(wj[:, k], [50, 5, 95])
        fa, flo, fhi = np.percentile(wf[:, k], [50, 5, 95])
        p(f"  {rules[k]:19s} {worst0[k]:.3f} | {a:.3f} [{lo:.3f}, {hi:.3f}] | {fa:.3f} [{flo:.3f}, {fhi:.3f}]  "
          + "  ".join(f"{f} {np.median(joint[:, fi, k]):.3f}" for fi, f in enumerate(FAMS)))
    kd = rules.index("degree")
    p("\n## share of joint draws in which the rule's worst-case regret is below top degree's / is the minimax rule")
    best = np.argmin(wj, 1)
    for k in np.argsort(np.median(wj, 0)):
        p(f"  {rules[k]:19s} {(wj[:, k] < wj[:, kd]).mean():.3f}  {(best == k).mean():.3f}")

    # added after the first full run (results_shared_runs.txt), see LOG.md: where the tail comes from
    ndet = len(rules) - len(rand_names())
    def regrets_det(pick):
        out = np.zeros((B_BOOT, len(FAMS), ndet))
        for bi in range(B_BOOT):
            for fi, f in enumerate(FAMS):
                tot = E[pick(bi, f)][:ndet] @ W[bi]
                out[bi, fi] = 1 - tot / tot.max()
        return out
    jd = regrets_det(lambda bi, f: draws[bi][f])
    wjd = jd.max(1)
    p("\n## diagnostic (post hoc): worst-case regret against the best deterministic rule only, joint draws")
    for k in np.argsort(np.median(wjd, 0))[:8]:
        a, lo, hi = np.percentile(wjd[:, k], [50, 5, 95])
        p(f"  {rules[k]:19s} {a:.3f} [{lo:.3f}, {hi:.3f}]")
    kdd0 = rules.index("dd-0.05")
    tail = np.argsort(-wj[:, kdd0])[: max(1, B_BOOT // 20)]
    p(f"\n## diagnostic (post hoc): the {len(tail)} joint draws with dd-0.05's largest worst-case regret")
    for bi in tail[:10]:
        fi = int(np.argmax(joint[bi, :, kdd0]))
        f = FAMS[fi]
        tot = E[draws[bi][f]] @ W[bi]
        p(f"  draw {bi}: worst under {f} ({label(draws[bi][f])}), regret {wj[bi, kdd0]:.3f}, "
          f"best rule {rules[int(np.argmax(tot))]}, max village weight {W[bi].max() * G:.1f}x")
    fams_tail = [FAMS[int(np.argmax(joint[bi, :, kdd0]))] for bi in tail]
    p("  family of the worst case in the tail: " + ", ".join(f"{f} {fams_tail.count(f)}" for f in FAMS))
    p("  tail draws' refitted sigma: " + ", ".join(
        f"{f} " + "/".join(f"{POINTS[draws[bi][f]][6]:g}" for bi in tail[:10]) for f in FAMS))

    p("\n## adopters per village under the point fits (share of households)")
    for f in FAMS:
        top = np.argsort(-full[f])[:5]
        p(f"  {f}: " + ", ".join(f"{rules[k]} {full[f][k] / G:.2f}" for k in top)
          + f" | random {full[f][rules.index('random')] / G:.2f}")

    kdd = rules.index("dd-0.05")
    med = {q: float(np.median(wj[:, rules.index(f'dd-{q:g}')])) for q in P_GRID}
    h8a = np.median(wj[:, kdd]) <= 0.02
    h8b = (wj[:, kdd] < wj[:, kd]).mean() >= 0.9
    inner = [med[q] for q in P_GRID if q <= 0.1]
    h9a = max(inner) - min(inner) <= 0.01
    h9b = med[0.05] - min(med.values()) <= 0.005
    kg = rules.index("greedy-T")
    p("\n## degree discount p sweep: median worst-case regret over joint draws")
    p("  " + ", ".join(f"p {q:g} {med[q]:.4f}" for q in P_GRID))
    p(f"\nH8 (dd p=0.05 median worst-case <= 2% and beats top degree in >= 90% of draws): "
      f"{'held' if h8a and h8b else 'refuted'}; median {np.median(wj[:, kdd]):.4f}, "
      f"beats degree in {(wj[:, kdd] < wj[:, kd]).mean():.3f}")
    p(f"   greedy-T (reported, not tested): median {np.median(wj[:, kg]):.4f}, "
      f"beats degree in {(wj[:, kg] < wj[:, kd]).mean():.3f}")
    p(f"H9 (p spread <= 1 point over [0.01, 0.1]; p 0.05 within 0.5 point of best): "
      f"{'held' if h9a and h9b else 'refuted'}; spread {max(inner) - min(inner):.4f}, "
      f"gap to best {med[0.05] - min(med.values()):.4f} (best p {min(med, key=med.get):g})")
    p(f"runtime {time.time() - t0:.0f} s")
    txt = "\n".join(lines) + "\n"
    open(os.path.join(OUT_DIR, "smoke.txt" if SMOKE else "results.txt"), "w").write(txt)
    json.dump({"rules": rules,
               "worst_point": worst0.round(5).tolist(),
               "worst_joint_q": np.percentile(wj, [5, 50, 95], 0).round(5).tolist(),
               "worst_fixed_q": np.percentile(wf, [5, 50, 95], 0).round(5).tolist(),
               "dd_p_median": med},
              open(os.path.join(OUT_DIR, "smoke.json" if SMOKE else "regret.json"), "w"), indent=1)
    print(txt)
    return dict(rules=rules, joint=joint, fixed=fixed, W=W, E=E, draws=draws, point=point,
                det_sets=det_sets, worst0=worst0, full=full)


if __name__ == "__main__":
    main()
