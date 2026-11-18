"""Milestone 11aa post-hoc check (written after the first layouts' cached 4-point sub-rule ratios were seen, up to 1% from the 8-point rule; no predictions): how far is the
8-point midpoint zone rule of exact_dense from the converged en-route total? Re-runs exact_dense.exact_terms on the
given layouts with K = 32 (and its 16-point sub-rules) and compares the en-route totals with the K = 8 run.

    OMP_NUM_THREADS=1 /usr/bin/python3.13 zone_quadrature_check.py 1 4 > zone_quadrature_check_results.txt

Milestone 11ae reuse (post hoc, after its 4-point sub-rules again differed from the 8-point rule by up to 1.3%): a
layout given as m:idx draws random_layouts.draw_layout(pts, idx, m), e.g. 12:1202 16:1603.

    OMP_NUM_THREADS=1 /usr/bin/python3.13 zone_quadrature_check.py 12:1202 16:1603 > zone_quadrature_scale_results.txt
"""
import importlib.util
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ed = _load("hub_airspace_exact_dense_11aa_q", "exact_dense.py")
rl = _load("hub_airspace_random_layouts_11aa_q", "random_layouts.py")


def enr(w):
    return sum(v for k, v in w.items() if k[2] == "enr")


def one(args):
    lay, K = args
    m, idx = (int(x) for x in lay.split(":")) if isinstance(lay, str) else (None, lay)
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx) if m is None else rl.draw_layout(pts, idx, m)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    c0 = time.process_time()
    out = ed.exact_terms(mix, speeds, rl.LAM, R=50.0, K=K)
    return lay, K, {k: enr(v) for k, v in out.items()}, sum(out["all"].values()), time.process_time() - c0


def main():
    lays = [a if ":" in a else int(a) for a in sys.argv[1:]] or [1]
    jobs = [(i, K) for i in lays for K in (8, 32)]
    with mp.Pool(min(4, len(jobs))) as p:
        res = p.map(one, jobs)
    print("# Milestone 11aa post hoc: zone quadrature, en-route totals (all pairs) at K = 8 and K = 32")
    print("idx   K   enr_all   enr_even  enr_odd   all_zones   CPU s")
    by = {}
    for idx, K, e, tot, cpu in res:
        by[(idx, K)] = e
        print("%7s %3d  %.5f  %.5f  %.5f  %.5f  %5.0f" % (idx, K, e["all"], e["even"], e["odd"], tot, cpu))
    for i in lays:
        print("layout %s: K=8 / K=32 en-route %.5f; K=32 even/odd sub-rules / K=32: %.5f %.5f" % (
            i, by[(i, 8)]["all"] / by[(i, 32)]["all"], by[(i, 32)]["even"] / by[(i, 32)]["all"],
            by[(i, 32)]["odd"] / by[(i, 32)]["all"]))


if __name__ == "__main__":
    main()
