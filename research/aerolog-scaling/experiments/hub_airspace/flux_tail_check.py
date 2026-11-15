"""Milestone 11x, post-hoc check (written after flux_term_results.txt was read; no predictions): is the sampled closed
form's skew below the deterministic flux term (E1: 15 of 24 z < 0, pooled 0.42% low) a heavy tail of the per-pair
window? For four layouts (the two most negative z, 22 and 18, the highest cv, 5, and one near zero, 13) the sampled
flux (graph_partition.closed_form_pairs, en-route, all pairs) is re-run with 16 fresh seeds of 400,000 pairs and
compared with cf_D from flux_term_results.txt; then, on one 400,000-pair draw, the share of the sum carried by the
top 0.1% and 1% of pair contributions.

    /usr/bin/python3.13 flux_tail_check.py > flux_tail_check_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import random
import re
import statistics as S

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rl = _load("hub_airspace_random_layouts_11x_tail", "random_layouts.py")
sb = _load("hub_airspace_steiner_bias_11x_tail", "steiner_bias.py")
gp = sb.gp
LAYOUTS, SEEDS, PAIRS = (22, 18, 5, 13), 16, 400000


def cf_d():
    out = {}
    for line in open(os.path.join(HERE, "flux_term_results.txt")):
        m = re.match(r"\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+[\d.]+\s+-?[\d.]+\s+[\d.]+\s*$", line)
        if m and int(m.group(1)) not in out:
            out[int(m.group(1))] = float(m.group(2))
    return out


def job(arg):
    idx, s = arg
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    if s >= 0:
        w = gp.closed_form_pairs(mix, speeds, rl.LAM, "semi", R=50.0, pairs=PAIRS, seed=900000 + 1000 * idx + s)
        return idx, s, sum(x for (i, j, z), x in w.items() if z == "enr")
    rnd, smp, xs = random.Random(910000 + idx), gp.Sampler(mix), []
    for _ in range(PAIRS):
        fa, fb = smp.draw(rnd), smp.draw(rnd)
        xs.append(sum(x for _, z, x in sb.cf_pair(fa, fb, speeds, 50.0) if z == "enr"))
    xs.sort(reverse=True)
    tot = sum(xs)
    return idx, s, (sum(xs[:PAIRS // 1000]) / tot, sum(xs[:PAIRS // 100]) / tot, sum(x > 0 for x in xs) / PAIRS)


def main():
    D = cf_d()
    jobs = [(i, s) for i in LAYOUTS for s in list(range(SEEDS)) + [-1]]
    with mp.Pool(4) as p:
        res = p.map(job, jobs)
    print("# 11x post-hoc: sampled flux (400,000 pairs, %d fresh seeds) against the deterministic cf_D (en-route)" % SEEDS)
    print("idx   cf_D    mean/cf_D  median/cf_D  below 1  min     max     top0.1%%  top1%%  nonzero")
    for i in LAYOUTS:
        r = [v / D[i] for j, s, v in res if j == i and s >= 0]
        t = [v for j, s, v in res if j == i and s < 0][0]
        print("%3d  %7.4f  %8.4f  %8.4f  %4d/%d  %6.4f  %6.4f  %6.3f  %6.3f  %6.3f" % (
            i, D[i], S.mean(r), S.median(r), sum(x < 1 for x in r), len(r), min(r), max(r), t[0], t[1], t[2]))


if __name__ == "__main__":
    main()
