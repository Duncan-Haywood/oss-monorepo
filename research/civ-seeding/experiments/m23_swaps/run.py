"""Milestone 23: why do the half weight's seed swaps turn costly between kappa = 0.1 and 0.25?

Milestone 22 found the half weight's step (census degree discount, phi = 0.25 false ties per true
tie placed to close triangles, recall 0.85) sits between kappa = 0.1 and 0.25: worst-case regret
+0.47 point (z 4.1) while the share of seeds swapped from the kappa = 0 set only drifts from 14.1
to 18.6%. So the step is in what the swaps cost, not how many there are. This run looks at the
swaps themselves, without the bootstrap harness: copy 0's seed draws (the same streams run.py and
seeds.py of milestone 22 use), every village and draw, scored under the three point fits (I, T, R;
`seeding.MODELS`) with common random numbers across rules, so paired differences are tight.

Rules: half weight at kappa = 0, 0.1, 0.25, and keeping every report. Per (village, draw): mean
adopters under each family; the true coverage of each seed set (households that are a seed or a
true neighbour of one); the true degree of the seeds swapped in and out between kappa = 0 and 0.1
and between 0.1 and 0.25; the false share of each seed's seen tie weight.

Tests H74-H78. Plan in LOG.md (2026-11-21, milestone 23), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m23_swaps/run.py   (SMOKE=1 for a toy run)
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from civ_seeding import bcdj, seeding as sd  # noqa: E402

SMOKE = bool(os.environ.get("SMOKE"))
EVAL_SEED, N_RAND, RHO, PHI, MODE, W = 5, 100, 0.85, 0.25, "closure", 0.5   # milestone 22's
S_RUN = 40          # contagion runs per seed set, shared across every set of a village (CRN)
FAMS = ("I", "T", "R")
if SMOKE:
    N_RAND, S_RUN = 4, 4
RULES = {"half k0": dict(kappa=0.0), "half k0.1": dict(kappa=0.1), "half k0.25": dict(kappa=0.25),
         "unfiltered": dict(kappa=0.0, w=0.0, recip=False)}
_V = _BETA = None


def _init():
    global _V, _BETA
    _V = bcdj.load()
    _BETA = bcdj.leader_logit(_V)[0]


def survey(v, k, kappa, w=W, recip=True):
    r = np.random.default_rng([EVAL_SEED, v.village, k, 7])
    return sd.survey_recall(v, 1.0, r, "uniform", None, RHO, fp=PHI, fp_mode=MODE, recip=recip,
                            fp_joint=kappa, recip_w=w)


def _village(g):
    v = _V[g]
    b = int(v.leader.sum())
    A = v.A > 0
    deg = v.deg.astype(float)
    sets = {x: [] for x in RULES}
    fshare = {x: [] for x in RULES}
    for k in range(N_RAND):
        for x, kw in RULES.items():
            _, est, seen = survey(v, k, kw["kappa"], kw.get("w", W), kw.get("recip", True))
            m = sd._dd_pick(est, seen, b)
            # the seed must equal milestone 22's rule exactly (same stream, same pick)
            if k == 0 and x == "half k0":
                assert (m == sd.rule_recall_dd(v, b, np.random.default_rng([EVAL_SEED, v.village, k, 7]), 1.0,
                                               "uniform", None, RHO, fp=PHI, fp_mode=MODE, recip=True,
                                               fp_joint=0.0, recip_w=W)).all()
            sets[x].append(m)
            sw = seen[m].sum(1)
            fshare[x].append(float(((seen[m] * ~A[m]).sum(1) / np.maximum(sw, 1e-12)).mean()))
    X = np.stack([s for x in RULES for s in sets[x]], 1)              # n x (rules * draws)
    adopt = {}
    for f in FAMS:
        e = sd.simulate_batch(v, _BETA, X, S_RUN, np.random.default_rng([EVAL_SEED, v.village, 23]),
                              **sd.MODELS[f]).mean(1)
        adopt[f] = e.reshape(len(RULES), N_RAND)
    cov = {x: np.array([((A[m].any(0)) | m).sum() / v.n for m in sets[x]]) for x in RULES}
    inner = {x: np.array([A[np.ix_(m, m)].sum() / 2 for m in sets[x]]) for x in RULES}

    def swaps(a, c):
        din, dout, nsw = [], [], []
        for m0, m1 in zip(sets[a], sets[c]):
            i, o = m1 & ~m0, m0 & ~m1
            nsw.append(int(i.sum()))
            if i.any():
                din.append(deg[i].mean())
                dout.append(deg[o].mean())
        return dict(n_swapped=float(np.mean(nsw)), deg_in=din, deg_out=dout)
    return g, dict(village=int(v.village), n=v.n, b=b, adopt={f: a.tolist() for f, a in adopt.items()},
                   cov={x: c.tolist() for x, c in cov.items()}, inner={x: c.tolist() for x, c in inner.items()},
                   fshare={x: float(np.mean(s)) for x, s in fshare.items()},
                   sw01=swaps("half k0", "half k0.1"), sw125=swaps("half k0.1", "half k0.25"))


def paired(dx):
    """mean and se of per-draw differences (dx: draws array)."""
    dx = np.asarray(dx, float)
    return float(dx.mean()), float(dx.std(ddof=1) / np.sqrt(len(dx)))


def main():
    _init()
    G = 3 if SMOKE else len(_V)
    with ProcessPoolExecutor(4, initializer=_init) as ex:
        res = dict(ex.map(_village, sorted(range(G), key=lambda g: -_V[g].n)))
    R = [res[g] for g in range(G)]
    xs = list(RULES)
    ix = {x: i for i, x in enumerate(xs)}
    # per draw k: total adopters over villages (the harness's equal-weight point), per family
    tot = {f: np.array([[sum(r["adopt"][f][ix[x]][k] for r in R) for k in range(N_RAND)] for x in xs])
           for f in FAMS}
    tot["mean"] = np.mean([tot[f] for f in FAMS], 0)
    lines = []
    p = lines.append
    p(f"# Milestone 23: the seed swaps of census degree discount at phi = {PHI:g} {MODE}, recall {RHO:g}")
    p(f"{G} villages x {N_RAND} draws (copy 0's streams), {S_RUN} common-random-number runs per set, "
      f"point fits {', '.join(FAMS)}")
    p("\n## total adopters over villages, mean over draws (contrast: paired over draws, se, z)")
    con = {}
    for f in (*FAMS, "mean"):
        base = tot[f][ix["half k0"]].mean()
        p(f"### {f}: " + ", ".join(f"{x} {tot[f][ix[x]].mean():.2f}" for x in xs))
        for a, c in (("half k0.1", "half k0"), ("half k0.25", "half k0.1"), ("half k0.25", "unfiltered"),
                     ("half k0", "unfiltered")):
            d, s = paired(tot[f][ix[a]] - tot[f][ix[c]])
            con[f"{f}: {a} - {c}"] = dict(d=d, se=s, rel=d / base)
            p(f"  {a} - {c}: {d:+.2f} adopters ({d / base * 100:+.2f}% of total; se {s:.2f}, z {d / s if s else 0:+.1f})")
    covt = {x: np.array([np.mean([r["cov"][x][k] for r in R]) for k in range(N_RAND)]) for x in xs}
    innt = {x: np.array([np.sum([r["inner"][x][k] for r in R]) for k in range(N_RAND)]) for x in xs}
    p("\n## true coverage of the seed set (mean over villages of share of households a seed or its true neighbour)")
    p("  " + ", ".join(f"{x} {covt[x].mean() * 100:.2f}%" for x in xs))
    p("## true ties among seeds (summed over villages)")
    p("  " + ", ".join(f"{x} {innt[x].mean():.1f}" for x in xs))
    c01, c125 = paired(covt["half k0.1"] - covt["half k0"]), paired(covt["half k0.25"] - covt["half k0.1"])
    i01, i125 = paired(innt["half k0.1"] - innt["half k0"]), paired(innt["half k0.25"] - innt["half k0.1"])
    p(f"  coverage k0.1 - k0: {c01[0] * 100:+.3f} pt (se {c01[1] * 100:.3f}); k0.25 - k0.1: {c125[0] * 100:+.3f} pt (se {c125[1] * 100:.3f})")
    p(f"  inner ties k0.1 - k0: {i01[0]:+.2f} (se {i01[1]:.2f}); k0.25 - k0.1: {i125[0]:+.2f} (se {i125[1]:.2f})")
    p("\n## false share of each seed's seen tie weight (mean over villages, draws, seeds)")
    p("  " + ", ".join(f"{x} {np.mean([r['fshare'][x] for r in R]) * 100:.1f}%" for x in xs))

    def swapstat(key):
        din = np.concatenate([r[key]["deg_in"] for r in R])
        dout = np.concatenate([r[key]["deg_out"] for r in R])
        d, s = paired(din - dout)
        return dict(n_swapped=float(np.mean([r[key]["n_swapped"] for r in R])), deg_in=float(din.mean()),
                    deg_out=float(dout.mean()), d=d, se=s, n=len(din))
    sw01, sw125 = swapstat("sw01"), swapstat("sw125")
    p("\n## true degree of seeds swapped in minus swapped out (mean over village-draws with a swap)")
    for tag, s in (("k0 -> k0.1", sw01), ("k0.1 -> k0.25", sw125)):
        p(f"  {tag}: {s['n_swapped']:.2f} seeds swapped per village-draw; in {s['deg_in']:.2f}, out {s['deg_out']:.2f}, "
          f"difference {s['d']:+.2f} (se {s['se']:.2f}, n {s['n']})")

    # per village: loss from k0.1 to k0.25 (mean family), coverage drop
    loss = np.array([np.mean([np.mean(np.array(r["adopt"][f][ix["half k0.1"]]) - np.array(r["adopt"][f][ix["half k0.25"]]))
                              for f in FAMS]) for r in R])
    cdrop = np.array([np.mean(np.array(r["cov"]["half k0.1"]) - np.array(r["cov"]["half k0.25"])) for r in R])

    def spearman(a, b_):
        ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b_))
        return float(np.corrcoef(ra, rb)[0, 1])
    order = np.argsort(-loss)
    pos = loss[loss > 0].sum()
    top5 = loss[order[:5]].sum() / pos if pos > 0 else 0.0
    rho_s = spearman(loss, cdrop) if G > 2 else 0.0
    p("\n## per village, k0.1 -> k0.25 (mean over families): adopters lost, coverage drop (pt), n, seeds")
    for g in order[:10]:
        r = R[g]
        p(f"  village {r['village']:3d}: lost {loss[g]:+.3f} adopters, coverage {cdrop[g] * 100:+.2f} pt, n {r['n']}, b {r['b']}")
    p(f"  villages with a loss: {(loss > 0).sum()} of {G}; top 5 carry {top5 * 100:.0f}% of the summed positive loss")
    p(f"  Spearman(loss, coverage drop) over villages: {rho_s:+.2f}")

    m = con["mean: half k0.25 - half k0.1"]
    m0 = con["mean: half k0.1 - half k0"]
    h74 = bool(m["d"] < -2 * m["se"] and abs(m0["d"]) <= 2 * m0["se"])
    h75 = bool(c125[0] < -2 * c125[1])
    h76 = bool(sw125["d"] < -2 * sw125["se"] and sw125["d"] < sw01["d"])
    h77 = bool(top5 > 0.5)
    h78 = bool(rho_s > 0.3)
    p(f"\nH74 (the point fits show the step: k0.25 below k0.1 by > 2 se, k0.1 within 2 se of k0; mean family): "
      f"{'held' if h74 else 'refuted'}; {m['d']:+.2f} (se {m['se']:.2f}), {m0['d']:+.2f} (se {m0['se']:.2f})")
    p(f"H75 (the k0.25 sets cover fewer households than the k0.1 sets by > 2 se): {'held' if h75 else 'refuted'}; "
      f"{c125[0] * 100:+.3f} pt (se {c125[1] * 100:.3f})")
    p(f"H76 (seeds swapped in at k0.1 -> k0.25 have lower true degree than those swapped out by > 2 se, "
      f"and by more than at k0 -> k0.1): {'held' if h76 else 'refuted'}; {sw125['d']:+.2f} (se {sw125['se']:.2f}) "
      f"against {sw01['d']:+.2f} (se {sw01['se']:.2f})")
    p(f"H77 (the loss is concentrated: top 5 villages carry over half): {'held' if h77 else 'refuted'}; {top5 * 100:.0f}%")
    p(f"H78 (per-village loss tracks coverage drop: Spearman > 0.3): {'held' if h78 else 'refuted'}; {rho_s:+.2f}")
    txt = "\n".join(lines) + "\n"
    out = "smoke_results" if SMOKE else "results"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump(dict(contrasts=con, coverage={x: float(c.mean()) for x, c in covt.items()},
                   inner={x: float(c.mean()) for x, c in innt.items()}, cov_contrast=[c01, c125],
                   inner_contrast=[i01, i125], swaps=[sw01, sw125], loss=loss.tolist(), cdrop=cdrop.tolist(),
                   villages=[r["village"] for r in R], top5=top5, spearman=rho_s,
                   h74=h74, h75=h75, h76=h76, h77=h77, h78=h78),
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
