"""Milestone 1: target-free self-calibration against Zhang on OpenCV's real stereo set.

    python3 experiments/m1_real/run.py            # all views + view-subset sweep (~25 min on 4 cores)
    python3 experiments/m1_real/run.py --quick    # all views only

Writes experiments/m1_real/results.json.
"""
import glob, json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import detect, zhang, selfcal_best  # noqa: E402

SIZES = list(range(3, 13))
PER_SIZE = 20
INIT_FACTOR = 1.3  # pre-registered: the starting focal length is 30% off


def load(cam):
    files = sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg")))
    cs, names = [], []
    for f in files:
        c, size = detect(f)
        if c is not None:
            cs.append(c)
            names.append(os.path.basename(f))
    return np.array(cs), size, names


def strip(d):
    return {k: float(v) for k, v in d.items() if not isinstance(v, list)}


def one(job):
    cam, k, i, idx, f0 = job
    obs, size, _ = CACHE[cam]
    sub = obs[list(idx)]
    rng = np.random.default_rng(1000 * k + i)
    refs = rng.choice(len(idx), size=min(2, len(idx)), replace=False)
    t = time.time()
    s = selfcal_best(sub, size, f0, nk=1, refs=[int(r) for r in refs])
    dt = time.time() - t
    z = zhang(list(sub), size, k2=False)
    return dict(cam=cam, k=k, i=i, views=[int(v) for v in idx], selfcal=s, seconds=dt, zhang=strip(z))


CACHE = {}


def main(quick=False):
    out = {"init_factor": INIT_FACTOR, "cams": {}, "subsets": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size, names = load(cam)
        CACHE[cam] = (obs, size, names)
        zr1 = zhang(list(obs), size, k2=False)
        zr2 = zhang(list(obs), size, k2=True)
        f0 = INIT_FACTOR * zr1["f"]
        full = {}
        for fac in (0.7, 1.3):
            for nk in (1, 2):
                full[f"init{fac}_k{nk}"] = selfcal_best(obs, size, fac * zr1["f"], nk=nk,
                                                         refs=[0, len(obs) // 2])
        out["cams"][cam] = dict(images=names, size=list(size), zhang_k1=strip(zr1), zhang_k2=strip(zr2),
                                selfcal_all=full)
        print(cam, "zhang f", round(zr1["f"], 2), "selfcal f", round(full["init1.3_k1"]["f"], 2), flush=True)
        if quick:
            continue
        rng = np.random.default_rng({"left": 1, "right": 2}[cam])
        n = len(obs)
        for k in SIZES:
            for i in range(PER_SIZE):
                idx = tuple(sorted(rng.choice(n, size=k, replace=False)))
                jobs.append((cam, k, i, idx, f0))
    if jobs:
        with Pool(4) as pool:
            for j, r in enumerate(pool.imap_unordered(one, jobs)):
                out["subsets"].append(r)
                if j % 20 == 0:
                    print(j, "/", len(jobs), flush=True)
    out["subsets"].sort(key=lambda r: (r["cam"], r["k"], r["i"]))
    with open(os.path.join(HERE, "results.json" if not quick else "results_quick.json"), "w") as fh:
        json.dump(out, fh, indent=1)


if __name__ == "__main__":
    main(quick="--quick" in sys.argv)
