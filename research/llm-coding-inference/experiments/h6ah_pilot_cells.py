"""Milestone 6ah: 6ag's two coder-cell audit with the allocation estimated from a pilot instead of an oracle. A simple random pilot of
PILOT_SHARE * n items from the whole pool is hand-coded; per-cell residual variance S2 is estimated from it (control-variate weight and variance
of y - lam f, plus-one smoothing so an all-negative cell is not given zero weight); the remaining audit is allocated Neyman-style on those
estimates and the pilot items count toward their cell. Compared with the oracle allocation of 6ag, size-proportional allocation over the same
cells, and one pooled stratum. Same rules, seed, draws, estimators and coders as 6ag. Writes h6ah_pilot_cells.txt.

    python3 experiments/h6ah_pilot_cells.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
"""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6ab_llm_goemotions as B  # noqa: E402
import h6ac_pooled_lambda as C  # noqa: E402
import h6ad_wilson_ppi as D  # noqa: E402
import h6ae_merge_strata as M  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
CATS = ("fear", "sadness", "admiration", "neutral")
PILOT_SHARE = 0.3
Z = E.Z95


def score(strata, truth):
    h, p = E.stratified_ppi_tuned(strata, 0.0), C.pooled(strata, False)
    out = {"human normal": (Z * h.se, E.covers(h, truth))}
    for name, e in (("human Wilson (WH)", h), ("P Wilson n_eff (WE)", p)):
        lo, hi = D.wilson_eff(e)
        out[name] = ((hi - lo) / 2, lo <= truth <= hi)
    return out


def build(strata_ids, picked, f, human):
    return [(len(s), [f[i] for i in s], [human[i] for i in idx], [f[i] for i in idx]) for s, idx in zip(strata_ids, picked)]


def sim_pilot(cells, f, human, n, truth, rr):
    """Pilot-estimated Neyman over `cells`; returns (scores, total humans used)."""
    pool = [i for s in cells for i in s]
    pilot = set(rr.sample(pool, round(PILOT_SHARE * n)))
    sizes = [len(s) for s in cells]
    s2 = []
    for s in cells:
        py = [human[i] for i in s if i in pilot]
        pf = [f[i] for i in s if i in pilot]
        s2.append(max(1e-4, E.stratum_lambda_s2(py + [1, 0], pf + [1, 0])[1]) if len(py) > 1 else 0.25)  # +1 pseudo-pair per label, so S2 > 0
    alloc = P.allocate(n, sizes, s2, sizes)
    picked = []
    for s, a in zip(cells, alloc):
        have = [i for i in s if i in pilot]
        rest = [i for i in s if i not in pilot]
        picked.append(have + rr.sample(rest, max(0, min(len(rest), a - len(have)))))
    return score(build(cells, picked, f, human), truth), sum(len(x) for x in picked)


def sim_prop(cells, f, human, n, truth, rr):
    sizes = [len(s) for s in cells]
    tot = sum(sizes)
    picked = [rr.sample(s, min(len(s), max(2, round(n * len(s) / tot)))) for s in cells]
    return score(build(cells, picked, f, human), truth), sum(len(x) for x in picked)


def main():
    out = []
    for cat in CATS:
        rows = P.load(cat)
        rng = random.Random(R.SPLIT_SEED)
        order = list(range(len(rows)))
        rng.shuffle(order)
        cut = int(R.TRAIN_SHARE * len(rows))
        train, test = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
        human, n = [t[2] for t in test], len(test)
        prev_tr = sum(t[2] for t in train) / len(train)
        sc = B.scores(cat, n)
        thr = sorted(sc)[int(n * (1 - min(0.5, 3 * prev_tr)))]
        coders = {"LLM score>0": [int(x > 0) for x in sc], "LLM 3x cut": [int(x > thr) for x in sc]}
        truth = sum(human) / n
        out.append(f"{cat}: corpus {n}, prevalence {truth:.4f}, {REPS} draws: coder | design | n | rule | coverage % | mean half-width pts | mean humans used")
        for name, f in coders.items():
            cells = [[i for i in range(n) if f[i] == c] for c in (1, 0)]
            cells = [s for s in cells if s]
            designs = {
                "1 pooled": lambda n_, rr: (M.sim([list(range(n))], f, human, n_, truth, rr), n_),
                "2 cells oracle": lambda n_, rr: (M.sim(cells, f, human, n_, truth, rr), n_),
                "2 cells pilot": lambda n_, rr: sim_pilot(cells, f, human, n_, truth, rr),
                "2 cells prop": lambda n_, rr: sim_prop(cells, f, human, n_, truth, rr),
            }
            for dn, fn in designs.items():
                for na in B.SIZES_N:
                    rr = random.Random(B.SEED)
                    r = [fn(na, rr) for _ in range(REPS)]
                    used = sum(x[1] for x in r) / REPS
                    for rule in r[0][0]:
                        out.append(f"{name} | {dn} | {na} | {rule} | {100 * sum(x[0][rule][1] for x in r) / REPS:.1f} | {100 * sum(x[0][rule][0] for x in r) / REPS:.3f} | {used:.0f}")
        out.append("")
        print("\n".join(out[-50:]), flush=True)
    (HERE / "h6ah_pilot_cells.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
