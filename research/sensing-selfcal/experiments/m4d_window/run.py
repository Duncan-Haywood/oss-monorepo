"""Milestone 4d: milestone 4b's solves on cornerSubPix 5x5-window corners.

    OMP_NUM_THREADS=1 python3 experiments/m4d_window/run.py      # ~40-60 min on 4 cores

Milestone 6b found the 5x5 window the one localiser this board's half-width end squares do
not bias. This re-solves every view set milestone 4b solved (milestone 4's splits, every old
and new set, every leave-one-view-out subset needed for the jackknife) on 5x5 corners, with
the same solver, references and start (1.3x the 11x11 Zhang f), and first re-solves the
all-view set on 11x11 and SB corners to check this environment reproduces milestone 4b's
stored solutions. Writes results.json.gz in milestone 4b's format; analyse.py scores it.
"""
import gzip, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import selfcal_fixed_best  # noqa: E402

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4brun", os.path.join(ROOT, "experiments", "m4b_viewcov", "run.py"))
m4b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4b)

METHODS = ("subpix5",)
CACHE = {}


def solve(job):
    method, cam, views, f0 = job
    obs, size = CACHE[(cam, method)]
    s = selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in m4b.KEEP}
    return method, cam, list(views), s


def reproduce_check():
    """Re-solve the 13-view set on 11x11 and SB corners; compare with milestone 4b's file."""
    with gzip.open(os.path.join(ROOT, "experiments", "m4b_viewcov", "results.json.gz"), "rt") as fh:
        old = json.load(fh)
    stored = {(r["method"], r["cam"]): r["sol"] for r in old["solutions"] if len(r["views"]) == 13}
    out = {}
    for method in ("subpix11", "sb"):
        for cam in ("left", "right"):
            obs, size, _ = m4b.load(cam, method)
            s = selfcal_fixed_best(obs, size, old["cams"][cam]["f0"], nk=1, refs=(0, 6))
            ref = stored[(method, cam)]
            out[f"{method}/{cam}"] = {k: float(s[k] - ref[k]) for k in ("f", "cx", "cy", "k1")}
            print("reproduce", method, cam, out[f"{method}/{cam}"], flush=True)
    return out, old


def main():
    check, old = reproduce_check()
    sp_list = old["splits"]
    sets = m4b.view_sets(sp_list)
    out = {"init_factor": old["init_factor"], "methods": list(METHODS), "cams": old["cams"], "splits": sp_list,
           "reproduce_m4b": check, "solutions": []}
    jobs = []
    for method in METHODS:
        for cam in ("left", "right"):
            obs, size, names = m4b.load(cam, method)
            assert len(obs) == 13 and names == old["cams"][cam]["names"], (cam, method, len(obs))
            CACHE[(cam, method)] = (obs, size)
            jobs += [(method, cam, v, old["cams"][cam]["f0"]) for v in sets]
    # Each solve is appended to a checkpoint as it finishes, so a restarted container resumes
    # where it stopped (one run lost 40 minutes to a restart). The checkpoint is gitignored-sized
    # scratch: it is deleted once results.json.gz is written.
    ckpt = os.path.join(HERE, "partial.jsonl")
    done = {}
    if os.path.exists(ckpt):
        for line in open(ckpt):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:   # a line cut off by the restart
                continue
            done[(r["method"], r["cam"], tuple(r["views"]))] = r
    jobs = [j for j in jobs if (j[0], j[1], tuple(j[2])) not in done]
    print(len(sets), "view sets,", len(jobs), "solves to go,", len(done), "from the checkpoint", flush=True)
    enc = lambda o: o.tolist() if hasattr(o, "tolist") else float(o)  # noqa: E731
    with Pool(4) as pool, open(ckpt, "a") as fh:
        for j, (method, cam, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=4)):
            r = dict(method=method, cam=cam, views=views, sol=s)
            fh.write(json.dumps(r, default=enc) + "\n"); fh.flush()
            done[(method, cam, tuple(views))] = r
            if j % 250 == 0:
                print(j, "/", len(jobs), flush=True)
    out["solutions"] = list(done.values())
    out["solutions"].sort(key=lambda r: (r["method"], r["cam"], len(r["views"]), r["views"]))
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o))
    os.remove(ckpt)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
