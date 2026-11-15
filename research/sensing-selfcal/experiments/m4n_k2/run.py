"""Milestone 4n, step 1: re-solve the TUM units' subsets with a second radial term (k1 + k2).

    OMP_NUM_THREADS=1 python3 experiments/m4n_k2/run.py      # ~90 min on 4 cores, fr1 most of it

Milestone 4j's run (experiments/m4j_tum/run.py) with nk=2 instead of 1 and nothing else changed:
the same stored corners, solver (selfcal_fixed_best, references 0 and n // 2) and cold start
(1.3x the k1 Zhang f, the value 4j stored). Only the sizes the 7 + 6 design needs are solved
(5, 6 and 7 views: old sets, new sets and their delete-one sets) plus all 13, so 4,720 solves
per unit. Writes results.json.gz in milestone 4f's format (cam = unit); analyse.py scores the
plan in LOG.md (2026-11-15, milestone 4n planned). A checkpoint (partial.jsonl) lets it resume.
"""
import gzip, itertools, json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "experiments", "m4j_tum"))
import tumunit as tu  # noqa: E402

NK = 2
KEEP = ("f", "cx", "cy", "k1", "k2", "sf", "rms", "cost", "nfev", "status", "ref")
SIZES = (5, 6, 7, 13)
CACHE = {}


def solve(job):
    unit, views, f0 = job
    obs, size = CACHE[unit]
    s = tu.sc.selfcal_fixed_best(obs[list(views)], size, f0, nk=NK, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in KEEP}
    return unit, list(views), s


def f0_stored(unit):
    with gzip.open(os.path.join(ROOT, "experiments", "m4j_tum", "results.json.gz"), "rt") as fh:
        return json.load(fh)["cams"][unit]["f0"]


def main():
    cams, jobs = {}, []
    for unit in tu.UNITS:
        obs, size, names = tu.load(unit)
        CACHE[unit] = (obs, size)
        cams[unit] = dict(names=names, f0=f0_stored(unit), size=list(size), nk=NK)
        for n in SIZES:
            jobs += [(unit, v, cams[unit]["f0"]) for v in itertools.combinations(range(13), n)]
    jobs.sort(key=lambda j: (len(j[1]) != 13, j[0] != "fr3", -len(j[1])))   # quick ones first
    ckpt = os.path.join(HERE, "partial.jsonl")
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
        for j, (unit, views, s) in enumerate(pool.imap_unordered(solve, jobs, chunksize=4)):
            r = dict(method="subpix5", cam=unit, views=views, sol=s)
            fh.write(json.dumps(r, default=enc) + "\n"); fh.flush()
            done[(unit, tuple(views))] = r
            if j % 250 == 0:
                print(j, "/", len(jobs), flush=True)
    out = {"method": "subpix5", "nk": NK, "cams": cams,
           "solutions": sorted(done.values(), key=lambda r: (r["cam"], len(r["views"]), r["views"]))}
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh, default=enc)
    os.remove(ckpt)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
