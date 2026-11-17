"""Milestone 4j, step 2: solve every subset of 3 to 7 of each TUM unit's 13 views, and all 13.

    OMP_NUM_THREADS=1 python3 experiments/m4j_tum/run.py      # ~30-40 min on 4 cores

Milestone 4f's solver (selfcal_fixed_best, k1 only, references 0 and n // 2, start 1.3x the k1
Zhang f) on the 5x5-window corners prepare.py stored. 5,720 subsets per unit plus the 13-view set.
Writes results.json.gz in milestone 4f's format (cam = unit); analyse.py scores the plan in LOG.md.
"""
import gzip, itertools, json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tumunit as tu  # noqa: E402

KEEP = ("f", "cx", "cy", "k1", "sf", "rms", "cost", "nfev", "status", "ref")
SIZES = list(range(3, 8)) + [13]
CACHE = {}


def solve(job):
    unit, views, f0 = job
    obs, size = CACHE[unit]
    s = tu.sc.selfcal_fixed_best(obs[list(views)], size, f0, nk=1, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in KEEP}
    return unit, list(views), s


def main():
    cams, jobs = {}, []
    for unit in tu.UNITS:
        obs, size, names = tu.load(unit)
        CACHE[unit] = (obs, size)
        cams[unit] = dict(names=names, f0=tu.f0(unit), size=list(size))
        for n in SIZES:
            jobs += [(unit, v, cams[unit]["f0"]) for v in itertools.combinations(range(13), n)]
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
    print(len(jobs), "solves to go,", len(done), "from the checkpoint", flush=True)
    enc = lambda o: o.tolist() if hasattr(o, "tolist") else float(o)  # noqa: E731
    with Pool(4) as pool, open(ckpt, "a") as fh:
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
