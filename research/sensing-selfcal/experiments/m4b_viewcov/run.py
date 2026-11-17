"""Milestone 4b: the update test with a covariance each calibration computes from its own views.

    OMP_NUM_THREADS=1 python3 experiments/m4b_viewcov/run.py      # ~30-60 min on 4 cores

For each detector (cornerSubPix 11x11 as in milestones 1-5, and findChessboardCornersSB) and
camera: milestone 4's splits (same seeds), every old and new view set solved with the
milestone-2 solver (k1 model, reference views 0 and n // 2, start 1.3x Zhang's f), and every
leave-one-view-out subset of the old sets and of the new sets with k >= 4, for the jackknife.
Each distinct view set is solved once. Writes results.json.gz; analyse.py applies the rule.
"""
import gzip, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import selfcal_fixed_best, zhang  # noqa: E402

import importlib.util  # noqa: E402


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "experiments", rel, "run.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


load = _module("m6run", "m6_detector").load          # milestone 6: corners per camera and detector
_m4 = _module("m4run", "m4_accept")                  # milestone 4: the splits and the start factor
splits, INIT_FACTOR = _m4.splits, _m4.INIT_FACTOR

METHODS = ("subpix11", "sb")
CACHE = {}
# Kept per solve (the rest of selfcal's summary is milestones 1-6's diagnostics; dropping it
# keeps the file small; run.py also gzips it).
KEEP = ("f", "cx", "cy", "k1", "sf", "scx", "scy", "rms", "cost", "nfev", "status", "ref", "cov_intr",
        "sf_cr_view", "cov_intr_cr_view")


def view_sets(sp_list, n=13):
    sets = {tuple(range(n))}
    for sp in sp_list:
        old, new = tuple(sp["old"]), tuple(sp["new"])
        sets.update([old, new])
        sets.update(tuple(v for v in old if v != d) for d in old)
        if len(new) >= 4:
            sets.update(tuple(v for v in new if v != d) for d in new)
    return sorted(sets, key=lambda t: (len(t), t))


def solve(job):
    method, cam, views, f0 = job
    obs, size = CACHE[(cam, method)]
    s = selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in KEEP}
    return method, cam, list(views), s


def main():
    sp_list = splits()
    sets = view_sets(sp_list)
    out = {"init_factor": INIT_FACTOR, "methods": list(METHODS), "cams": {}, "splits": sp_list, "solutions": []}
    jobs = []
    for method in METHODS:
        for cam in ("left", "right"):
            obs, size, names = load(cam, method)
            assert len(obs) == 13, (cam, method, len(obs))
            CACHE[(cam, method)] = (obs, size)
            # f0 from milestone 4's start (1.3x the 11x11 Zhang f), the same for both detectors
            if cam not in out["cams"]:
                o11, s11, _ = load(cam, "subpix11")
                out["cams"][cam] = dict(size=list(size), f0=INIT_FACTOR * zhang(list(o11), s11, k2=False)["f"],
                                        names=names)
            jobs += [(method, cam, v, out["cams"][cam]["f0"]) for v in sets]
    print(len(sets), "view sets,", len(jobs), "solves", flush=True)
    with Pool(4) as pool:
        for j, (method, cam, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=4)):
            out["solutions"].append(dict(method=method, cam=cam, views=views, sol=s))
            if j % 250 == 0:
                print(j, "/", len(jobs), flush=True)
    out["solutions"].sort(key=lambda r: (r["method"], r["cam"], len(r["views"]), r["views"]))
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:   # ~3 MB instead of ~10
        json.dump(out, fh)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
