"""Milestone 6ai: repairs for 6ah's pilot-estimated two-coder-cell allocation. (a) floor: the Neyman allocation is kept, but no cell gets less than
FLOOR * n audit items (pilot items count). (b) independent pilot: a pilot of PILOT_SHARE * n is hand-coded and used only to estimate S2; the
remaining (1 - PILOT_SHARE) * n is a fresh audit allocated on those estimates, and the pilot items are not in the estimate. Same pools, coders,
rules, seed and draws as 6ah; the pooled and oracle designs are re-run for reference. Writes h6ai_floor_indep.txt.

    python3 experiments/h6ai_floor_indep.py [reps]    # stdlib only + cached gollm_*.tsv; a few minutes
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
import h6ae_merge_strata as M  # noqa: E402
import h6ah_pilot_cells as H  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402
from llmci import estimators as E  # noqa: E402

REPS = int(ARGS[0]) if ARGS else 500
CATS = H.CATS
PILOT_SHARE = 0.3


def est_s2(cells, f, human, pilot):
    s2 = []
    for s in cells:
        py = [human[i] for i in s if i in pilot]
        pf = [f[i] for i in s if i in pilot]
        s2.append(max(1e-4, E.stratum_lambda_s2(py + [1, 0], pf + [1, 0])[1]) if len(py) > 1 else 0.25)
    return s2


def floored(alloc, sizes, n, floor):
    lo = [min(sz, max(2, round(floor * n))) for sz in sizes]
    alloc = [max(a, l) for a, l in zip(alloc, lo)]
    over = sum(alloc) - n
    while over > 0:  # take the excess from the cells above their floor, largest first
        k = max((j for j in range(len(alloc)) if alloc[j] > lo[j]), key=lambda j: alloc[j], default=None)
        if k is None:
            break
        d = min(over, alloc[k] - lo[k])
        alloc[k] -= d
        over -= d
    return alloc


def sim_floor(cells, f, human, n, truth, rr, floor):
    pool = [i for s in cells for i in s]
    pilot = set(rr.sample(pool, round(PILOT_SHARE * n)))
    sizes = [len(s) for s in cells]
    alloc = floored(P.allocate(n, sizes, est_s2(cells, f, human, pilot), sizes), sizes, n, floor)
    picked = []
    for s, a in zip(cells, alloc):
        have = [i for i in s if i in pilot]
        rest = [i for i in s if i not in pilot]
        picked.append(have + rr.sample(rest, max(0, min(len(rest), a - len(have)))))
    return H.score(H.build(cells, picked, f, human), truth), sum(len(x) for x in picked)


def sim_indep(cells, f, human, n, truth, rr, floor):
    pool = [i for s in cells for i in s]
    npil = round(PILOT_SHARE * n)
    pilot = set(rr.sample(pool, npil))
    sizes = [len(s) for s in cells]
    m = n - npil
    alloc = floored(P.allocate(m, sizes, est_s2(cells, f, human, pilot), sizes), sizes, m, floor)
    picked = [rr.sample([i for i in s if i not in pilot], min(len(s) - sum(i in pilot for i in s), a)) for s, a in zip(cells, alloc)]
    return H.score(H.build(cells, picked, f, human), truth), sum(len(x) for x in picked) + npil


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
            cells = [s for s in ([i for i in range(n) if f[i] == c] for c in (1, 0)) if s]
            designs = {
                "1 pooled": lambda n_, rr: (M.sim([list(range(n))], f, human, n_, truth, rr), n_),
                "2 cells oracle": lambda n_, rr: (M.sim(cells, f, human, n_, truth, rr), n_),
                "pilot floor 0.2": lambda n_, rr: sim_floor(cells, f, human, n_, truth, rr, 0.2),
                "pilot floor 0.35": lambda n_, rr: sim_floor(cells, f, human, n_, truth, rr, 0.35),
                "indep pilot floor 0.2": lambda n_, rr: sim_indep(cells, f, human, n_, truth, rr, 0.2),
                "indep pilot floor 0.35": lambda n_, rr: sim_indep(cells, f, human, n_, truth, rr, 0.35),
            }
            for dn, fn in designs.items():
                for na in B.SIZES_N:
                    rr = random.Random(B.SEED)
                    r = [fn(na, rr) for _ in range(REPS)]
                    used = sum(x[1] for x in r) / REPS
                    for rule in r[0][0]:
                        out.append(f"{name} | {dn} | {na} | {rule} | {100 * sum(x[0][rule][1] for x in r) / REPS:.1f} | {100 * sum(x[0][rule][0] for x in r) / REPS:.3f} | {used:.0f}")
        out.append("")
        print("\n".join(out[-90:]), flush=True)
    (HERE / "h6ai_floor_indep.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
