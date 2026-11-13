"""Milestone 4f: solve every subset of 3 to 12 of the 13 views on 5x5-window corners.

    OMP_NUM_THREADS=1 python3 experiments/m4f_setsize/run.py      # ~40-60 min on 4 cores

Milestone 4e found, post hoc, that the spread of f does not shrink as 1/n below about 5 views,
and guessed this is also why the leave-one-view-out jackknife overstated the real spread at
4-7 views. To test that across set sizes, this solves every view subset of size 3..12 of each
camera's 13 views (8,086 per camera) on cornerSubPix 5x5 corners (the localiser milestone 6b
found unbiased), with milestone 4b's solver, reference views and start. Subsets milestones 4d
and 4e already solved are reused, not re-solved. Writes results.json.gz (milestone 4b's
format, every 5x5 solve including the reused ones); analyse.py scores the plan in LOG.md.
"""
import gzip, itertools, json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import selfcal_fixed_best  # noqa: E402

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4brun", os.path.join(ROOT, "experiments", "m4b_viewcov", "run.py"))
m4b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4b)

METHOD = "subpix5"
CAMS = ("left", "right")
SIZES = range(3, 13)
CACHE = {}


def stored():
    """5x5 solves already on disk (milestones 4d and 4e), and milestone 4d's camera metadata."""
    have, cams = {}, None
    for rel in ("m4d_window", "m4e_selfscale"):
        with gzip.open(os.path.join(ROOT, "experiments", rel, "results.json.gz"), "rt") as fh:
            res = json.load(fh)
        cams = cams or res["cams"]
        for r in res["solutions"]:
            if r["method"] == METHOD:
                have[(r["cam"], tuple(r["views"]))] = r
    return have, cams


def solve(job):
    cam, views, f0 = job
    obs, size = CACHE[cam]
    s = selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in m4b.KEEP}
    return cam, list(views), s


def main():
    have, cams = stored()
    jobs = []
    for cam in CAMS:
        obs, size, names = m4b.load(cam, METHOD)
        assert len(obs) == 13 and names == cams[cam]["names"], cam
        CACHE[cam] = (obs, size)
        for n in SIZES:
            for v in itertools.combinations(range(13), n):
                if (cam, v) not in have:
                    jobs.append((cam, v, cams[cam]["f0"]))
    ckpt = os.path.join(HERE, "partial.jsonl")   # resume after a container restart; deleted at the end
    done = dict(have)
    if os.path.exists(ckpt):
        for line in open(ckpt):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            done[(r["cam"], tuple(r["views"]))] = r
    jobs = [j for j in jobs if (j[0], tuple(j[1])) not in done]
    print(len(have), "reused,", len(jobs), "solves to go", flush=True)
    enc = lambda o: o.tolist() if hasattr(o, "tolist") else float(o)  # noqa: E731
    with Pool(4) as pool, open(ckpt, "a") as fh:
        for j, (cam, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=8)):
            r = dict(method=METHOD, cam=cam, views=views, sol=s)
            fh.write(json.dumps(r, default=enc) + "\n"); fh.flush()
            done[(cam, tuple(views))] = r
            if j % 500 == 0:
                print(j, "/", len(jobs), flush=True)
    out = {"method": METHOD, "cams": cams,
           "solutions": sorted(done.values(), key=lambda r: (r["cam"], len(r["views"]), r["views"]))}
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh, default=enc)
    os.remove(ckpt)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
