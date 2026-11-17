"""Milestone 4k, step 1: re-solve every subset of 3 to 7 of each TUM unit's 13 views (and all 13)
from a warm start, the fleet's nominal focal length, instead of milestone 4j's 1.3x the Zhang f.

    OMP_NUM_THREADS=1 python3 experiments/m4k_warm/run.py      # background job, 4 cores

The solver is milestone 4f's, unchanged (selfcal_fixed_best, k1 only, references 0 and n // 2,
principal point started at the image centre, k1 at 0). Only the starting focal length changes:
F_PRIOR = the mean of TUM's published (fx + fy) / 2 for the two units, i.e. the figure a fleet with
one spec sheet for "this camera model" would hold. It is not fitted to any solve. Writes
results.json.gz in milestone 4j's format, so milestone 4j's analysis reads it unchanged.
"""
import gzip, itertools, json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4j_tum"))
import tumunit as tu  # noqa: E402

KEEP = ("f", "cx", "cy", "k1", "sf", "rms", "cost", "nfev", "status", "ref")
SIZES = list(range(3, 8)) + [13]
CACHE = {}


def fleet_prior():
    """Mean over the two units of TUM's published (fx + fy) / 2: 527.1 px."""
    return sum((tu.TUM_CALIB[u][0] + tu.TUM_CALIB[u][1]) / 2 for u in tu.UNITS) / len(tu.UNITS)


F_PRIOR = fleet_prior()


def solve(job):
    unit, views, f0 = job
    obs, size = CACHE[unit]
    s = tu.sc.selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in KEEP}
    return unit, list(views), s


def init():
    for unit in tu.UNITS:
        obs, size, _ = tu.load(unit)
        CACHE[unit] = (obs, size)


def main():
    init()
    cams, jobs = {}, []
    for unit in tu.UNITS:
        obs, size, names = tu.load(unit)
        cams[unit] = dict(names=names, f0=F_PRIOR, size=list(size), start="fleet prior")
        for n in SIZES:
            jobs += [(unit, v, F_PRIOR) for v in itertools.combinations(range(13), n)]
    ckpt = os.path.join(HERE, "partial.jsonl")   # resume after a container restart; deleted at the end
    done = {}
    if os.path.exists(ckpt):
        for line in open(ckpt):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            done[(r["cam"], tuple(r["views"]))] = r
    jobs = [j for j in jobs if (j[0], tuple(j[1])) not in done]
    print(len(jobs), "solves to go,", len(done), "from the checkpoint; f0 =", F_PRIOR, flush=True)
    enc = lambda o: o.tolist() if hasattr(o, "tolist") else float(o)  # noqa: E731
    with Pool(4, initializer=init) as pool, open(ckpt, "a") as fh:
        for j, (unit, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=8)):
            r = dict(method="subpix5", cam=unit, views=views, sol=s)
            fh.write(json.dumps(r, default=enc) + "\n"); fh.flush()
            done[(unit, tuple(views))] = r
            if j % 500 == 0:
                print(j, "/", len(jobs), flush=True)
    out = {"method": "subpix5", "cams": cams,
           "solutions": sorted(done.values(), key=lambda r: (r["cam"], len(r["views"]), r["views"]))}
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh, default=enc)
    os.remove(ckpt)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
