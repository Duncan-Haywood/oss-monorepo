"""Milestone 4e: solve every 3- and 4-view subset, so each old set's own split-half spread is known.

    OMP_NUM_THREADS=1 python3 experiments/m4e_selfscale/run.py      # ~30-45 min on 4 cores

The per-unit threshold of milestone 4e (LOG.md, 2026-11-13) splits each old set of 7 views into
4 + 3 views (35 ways) and measures how far apart the two halves' focal lengths fall. Across all
old sets of milestone 4's splits, those halves are every 3- and 4-view subset of the 13 views
(1,001 per camera). Milestones 4b and 4d already solved some of them; this solves the rest, for
all three corner localisers (cornerSubPix 11x11, findChessboardCornersSB, cornerSubPix 5x5),
with the same solver, reference views and start. Writes results.json.gz in milestone 4b's format
(only the new solves); analyse.py merges them with 4b's and 4d's.
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

METHODS = ("subpix11", "sb", "subpix5")
CACHE = {}


def inner_sets(sp_list):
    """Every half of every 4 + 3 partition of every old set with k >= 4."""
    out = set()
    for sp in sp_list:
        if sp["k"] < 4:
            continue
        old = tuple(sp["old"])
        for a in itertools.combinations(old, 4):
            out.add(a)
            out.add(tuple(v for v in old if v not in a))
    return sorted(out, key=lambda t: (len(t), t))


def stored():
    have = set()
    for rel in ("m4b_viewcov", "m4d_window"):
        with gzip.open(os.path.join(ROOT, "experiments", rel, "results.json.gz"), "rt") as fh:
            res = json.load(fh)
        have.update((r["method"], r["cam"], tuple(r["views"])) for r in res["solutions"])
    return have, res


def solve(job):
    method, cam, views, f0 = job
    obs, size = CACHE[(cam, method)]
    s = selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in m4b.KEEP}
    return method, cam, list(views), s


def main():
    have, res = stored()
    sets = inner_sets(res["splits"])
    jobs = []
    for method in METHODS:
        for cam in ("left", "right"):
            obs, size, names = m4b.load(cam, method)
            assert len(obs) == 13 and names == res["cams"][cam]["names"], (cam, method)
            CACHE[(cam, method)] = (obs, size)
            jobs += [(method, cam, v, res["cams"][cam]["f0"]) for v in sets if (method, cam, v) not in have]
    ckpt = os.path.join(HERE, "partial.jsonl")   # resume after a container restart; deleted at the end
    done = {}
    if os.path.exists(ckpt):
        for line in open(ckpt):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            done[(r["method"], r["cam"], tuple(r["views"]))] = r
    jobs = [j for j in jobs if (j[0], j[1], tuple(j[2])) not in done]
    print(len(sets), "inner sets per camera,", len(jobs), "solves to go,", len(done), "from the checkpoint", flush=True)
    enc = lambda o: o.tolist() if hasattr(o, "tolist") else float(o)  # noqa: E731
    with Pool(4) as pool, open(ckpt, "a") as fh:
        for j, (method, cam, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=4)):
            r = dict(method=method, cam=cam, views=views, sol=s)
            fh.write(json.dumps(r, default=enc) + "\n"); fh.flush()
            done[(method, cam, tuple(views))] = r
            if j % 250 == 0:
                print(j, "/", len(jobs), flush=True)
    out = {"methods": list(METHODS), "cams": res["cams"], "splits": res["splits"],
           "solutions": sorted(done.values(), key=lambda r: (r["method"], r["cam"], len(r["views"]), r["views"]))}
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh, default=enc)
    os.remove(ckpt)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
