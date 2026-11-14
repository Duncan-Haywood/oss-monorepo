"""Milestone 11r post-hoc diagnostic (written after exact_timing_results.txt, not pre-registered): are the two layouts
whose exact semi en-route total sat furthest from 11q's reference (8: z = 2.7, 22: z = 3.1) a bias or noise?
Ten new 200,000-flight simulator runs (seeds 100000 + 1000 k + layout) and 2,000,000 new exact pairs in 20 batches
(seed 110000 + layout) per layout; both independent of every earlier seed.

    python3 exact_timing_check.py > exact_timing_check_results.txt
"""
import math
import multiprocessing as mp
import statistics as S

import exact_timing_run as er

LAYOUTS = (8, 22)


def check(idx):
    rl, gp, et = er.rl, er.gp, er.et
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sims = []
    for k in range(10):
        c, hrs = gp.simulate_pairs(mix, speeds, er.LAM, fn, n_flights=200000, seed=100000 + 1000 * k + idx)
        sims.append(sum(v for kk, v in c.items() if kk[2] == "enr") / hrs)
    ex = [er.enr_total(b) for b in et.exact_pairs(mix, speeds, er.LAM, pairs=2000000, seed=110000 + idx, batches=20)]
    return idx, sims, ex


def main():
    print("# 11r post-hoc: layouts 8 and 22, semi en-route conflicts per hour; fresh seeds (see docstring)")
    with mp.Pool(2) as pool:
        res = pool.map(check, LAYOUTS)
    for idx, sims, ex in res:
        ms, ss = S.mean(sims), S.stdev(sims) / math.sqrt(len(sims))
        me, se = S.mean(ex), S.stdev(ex) / math.sqrt(len(ex))
        z = (me - ms) / math.hypot(ss, se)
        print(f"layout {idx}: simulator {ms:.3f} +- {ss:.3f} (se, 10 runs); exact {me:.3f} +- {se:.3f} (se, 20 batches); "
              f"exact/sim {me / ms:.4f}; z = {z:+.2f}")


if __name__ == "__main__":
    main()
