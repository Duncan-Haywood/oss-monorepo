"""Axelrod culture model: order-disorder transition and a global broadcast (LOG.md, 2026-10-28)."""
import sys, os, random, statistics as st
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
from civ_levers.culture import run, neighbours, regions

RUNS = 20


def one(args):
    L, F, q, B, seed = args
    rng = random.Random(seed)
    media = [0] * F if B > 0 else None   # media culture; traits are exchangeable so 0 is no loss
    cult, sweeps = run(L, F, q, B, rng, media=media, max_sweeps=20000, check_every=50)
    sz = regions(cult, neighbours(L))
    match = sum(c == media for c in cult) / len(cult) if media else float("nan")
    return len(sz), sz[0] / L ** 2, match, sweeps


def cell(pool, L, F, q, B, runs=RUNS):
    r = pool.map(one, [(L, F, q, B, 1000 * s + q) for s in range(runs)])
    col = lambda i: [x[i] for x in r]
    ci = lambda v: 1.96 * st.stdev(v) / len(v) ** .5
    return (st.mean(col(0)), ci(col(0)), st.mean(col(1)), ci(col(1)), st.mean(col(2)), max(col(3)))


def main():
    with Pool() as pool:
        print(f"{RUNS} runs per cell; mean +- 95% CI. regions = connected equal-culture sets; S = largest / sites\n")
        print("== Table 1: Axelrod's base case F=5 q=10, 10x10 (his reported mean: 3.2 regions)")
        m, c, s, sc, _, _ = cell(pool, 10, 5, 10, 0, runs=300)
        print(f"regions {m:.2f} +- {c:.2f}   S {s:.2f} +- {sc:.2f}  (300 runs)\n")
        print("== Table 2: largest region S vs q (B=0)")
        for F, qs, Ls in ((2, (2, 3, 4, 6, 8, 12), (12, 24)),
                          (3, (5, 10, 15, 20, 30, 50), (12, 24)),
                          (10, (20, 50, 100, 200, 300, 500), (12, 24))):
            for L in Ls:
                row = [f"q={q}:{cell(pool, L, F, q, 0)[2]:.2f}" for q in qs]
                print(f"F={F:<2} L={L:<3}" + "  ".join(row), flush=True)
        print("\n== Table 3: broadcast of strength B, F=5, L=20: regions / S / share holding the media culture")
        for q in (5, 10, 20, 40):
            for B in (0, 0.01, 0.03, 0.1, 0.3):
                m, c, s, sc, mt, sw = cell(pool, 20, 5, q, B)
                print(f"q={q:<3} B={B:<5} regions {m:6.1f}+-{c:4.1f}  S {s:.2f}+-{sc:.2f}  media-share {mt:.2f}  max sweeps {sw}", flush=True)


if __name__ == "__main__":
    main()
