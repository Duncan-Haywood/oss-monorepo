"""Milestone 11p, post-hoc diagnostic (written after sized_guard.py's results, not pre-registered): is the guard's
failure in layouts 22 and 3 short-run noise, a short-run bias, or noise in the fresh 200,000-flight scoring run?

For the two candidate splits a (census pick p_0) and b (the next distinct share-ordered pick) of layouts 22 and 3,
ten new 200,000-flight runs (seeds 50000 + 100 k + layout) and one hundred new 20,000-flight runs (seeds
60000 + 100 k + layout) give each candidate's kept en-route conflicts; pooled b/a and per-run spread are reported.

    python3 guard_noise.py > guard_noise_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import statistics as S
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sg_noise", os.path.join(HERE, "sized_guard.py")); sg = importlib.util.module_from_spec(spec); spec.loader.exec_module(sg)
rl, gp = sg.rl, sg.gp
CANDS = {22: ((0, 0, 0, 1, 0, 1, 1, 1), (0, 1, 1, 1, 0, 0, 1, 0)), 3: ((0, 0, 1, 1, 1, 1, 1, 0), (0, 1, 0, 1, 0, 0, 1, 1))}
def job(arg):
    idx, n, seed = arg
    pts = rl.load_nyc(10000.0); hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    w = gp.simulate_pairs(mix, speeds, sg.LAM, fn, n_flights=n, seed=seed)[0]
    a, b = CANDS[idx]
    return idx, n, gp.score(w, a), gp.score(w, b)


def main():
    jobs = [(i, 200000, 50000 + 100 * k + i) for i in CANDS for k in range(10)] + [(i, 20000, 60000 + 100 * k + i) for i in CANDS for k in range(100)]
    with mp.Pool(min(4, os.cpu_count() or 1)) as p:
        res = p.map(job, jobs)
    for i in CANDS:
        for n in (200000, 20000):
            r = [(a, b) for j, m, a, b in res if j == i and m == n]
            rat = [b / a for a, b in r]
            print(f"layout {i} n={n} runs={len(r)} pooled b/a {sum(b for _, b in r) / sum(a for a, _ in r):.4f} "
                  f"mean-of-ratios {S.mean(rat):.4f} sd {S.stdev(rat):.4f} mean kept a {S.mean(a for a, _ in r):.0f}")


if __name__ == "__main__":
    sys.exit(main())
