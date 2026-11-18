"""How big must a committed minority be to flip a convention? (LOG.md, 2026-11-11)

python3 experiments/convention/run.py > experiments/convention/results.txt  (~3 min, 4 cores)
"""
import os
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
from civ_levers.cascades import watts_strogatz, seeds_patch, seeds_random, seeds_spread  # noqa: E402
from civ_levers.convention import (  # noqa: E402
    adj_csr, complete_csr, mf_fc, simulate, xie_pc, xie_sim)

N_GROUP, RUNS, ROUNDS = 20, 40, 200
M_GROUP = list(range(3, 16))
LAT_N, LAT_K, LAT_G, LAT_ROUNDS = 1000, 8, 10, 1000
LAT_PS = [0.0, 0.1, 1.0]
LAT_F = [round(0.025 * i, 3) for i in range(1, 21)]
RULES = {"random": seeds_random, "patch": seeds_patch, "spread": seeds_spread}


def group_cell(args):
    M, c, rounds = args
    csr = complete_csr(N_GROUP)
    wins = 0
    for r in range(RUNS):
        rng = np.random.default_rng(1000 * M + 37 * c + r)
        com = np.zeros(N_GROUP, bool)
        com[:c] = True
        wins += simulate(csr, com, M, rounds, rng) > 0.5
    return M, c, rounds, wins


def lattice_cell(args):
    p, rule, f, M = args
    out = []
    for g in range(LAT_G):
        adj = watts_strogatz(LAT_N, LAT_K, p, np.random.default_rng(g))
        s = int(round(f * LAT_N))
        if rule == "spread":
            seeds = seeds_spread(adj, s, np.random.default_rng(500 + g))
            if len(seeds) < s:  # not enough mutually distant people: cell undefined
                return p, rule, f, M, float("nan")
        else:
            seeds = RULES[rule](adj, s, np.random.default_rng(500 + g))
        com = np.zeros(LAT_N, bool)
        com[seeds] = True
        out.append(simulate(adj_csr(adj), com, M, LAT_ROUNDS, np.random.default_rng(900 + g)))
    return p, rule, f, M, float(np.mean(out))


def main():
    print("== Table 1: Xie et al. (2011) binary agreement, committed fraction p")
    print(f"mean-field p_c (RK4 + bisection, this code): {xie_pc():.4f}   published: 0.0979")
    print("complete graph n=1000, t=300 (units of n interactions), 3 runs: final uncommitted A fraction")
    for p in (0.06, 0.08, 0.10, 0.12, 0.14):
        v = [xie_sim(1000, p, 300, np.random.default_rng(s)) for s in range(3)]
        print(f"p={p:.2f}  " + " ".join(f"{x:.2f}" for x in v))

    print("\n== Table 2: memory-M majority game, mean-field critical committed fraction f_c(M)")
    print("(even M equals M-1: a random tie-break makes the extra slot neutral)")
    for M in list(range(1, 32, 2)) + [51, 101, 201]:
        print(f"M={M:<4} f_c={mf_fc(M):.4f}")

    print(f"\n== Table 3: groups of N={N_GROUP} (complete graph), {RUNS} runs per cell")
    print("critical count c* = smallest committed count (of N, committed included) that flips")
    print("the uncommitted majority to the new name in >= half the runs; f* = c*/N")
    jobs = [(M, c, r) for r in (50, ROUNDS) for M in M_GROUP for c in range(1, N_GROUP)]
    with Pool(4) as pool:
        res = pool.map(group_cell, jobs)
    win = {(M, c, r): w for M, c, r, w in res}
    for rounds in (ROUNDS, 50):
        print(f"\n-- horizon {rounds} rounds")
        print("M    mf f_c   c*  f*     |f*-mf|  wins at c*-1, c*, c*+1")
        for M in M_GROUP:
            cs = [c for c in range(1, N_GROUP) if win[(M, c, rounds)] >= RUNS / 2]
            c0 = min(cs) if cs else None
            mf = mf_fc(M)
            if c0 is None:
                print(f"{M:<4} {mf:.4f}   -")
                continue
            near = [win.get((M, c, rounds), 0) for c in (c0 - 1, c0, c0 + 1)]
            print(f"{M:<4} {mf:.4f}   {c0:<3} {c0 / N_GROUP:.2f}   {abs(c0 / N_GROUP - mf):.3f}    "
                  + " ".join(f"{w}/{RUNS}" for w in near))

    M = 12
    print(f"\n== Table 4: where the committed sit. Watts-Strogatz n={LAT_N} k={LAT_K}, M={M} "
          f"(mean-field f_c {mf_fc(M):.3f}), {LAT_G} graphs, {LAT_ROUNDS} rounds")
    print("mean final fraction of uncommitted saying the new name, by committed fraction f")
    jobs = [(p, rule, f, M) for p in LAT_PS for rule in RULES for f in LAT_F]
    with Pool(4) as pool:
        res = pool.map(lattice_cell, jobs)
    tab = {(p, rule, f): v for p, rule, f, _, v in res}
    print("p     rule     " + " ".join(f"{f:>5}" for f in LAT_F))
    for p in LAT_PS:
        for rule in RULES:
            print(f"{p:<5} {rule:<8} " + " ".join(
                "    -" if np.isnan(tab[(p, rule, f)]) else f"{tab[(p, rule, f)]:5.2f}" for f in LAT_F))
    print("\nf_c = smallest f with mean final fraction > 0.5")
    for p in LAT_PS:
        row = []
        for rule in RULES:
            fs = [f for f in LAT_F if not np.isnan(tab[(p, rule, f)]) and tab[(p, rule, f)] > 0.5]
            row.append(f"{rule}={min(fs) if fs else '-'}")
        print(f"p={p:<5} " + "  ".join(row))


if __name__ == "__main__":
    main()
