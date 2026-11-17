"""Milestone 4s, step 2: solve the third view sets (fr1c, fr3c) with k1 + k2.

    OMP_NUM_THREADS=1 python3 experiments/m4s_third/run.py      # ~40 min to 2 h on 4 cores

Milestone 4p's run.py, unchanged but for the pool: milestone 4n's run (k1 + k2, selfcal_fixed_best, references 0 and n // 2) on the corners prepare.py
stored, with the cold start milestone 4j used for each unit (1.3x the k1 Zhang f), computed on the
fresh views themselves. Sizes 5, 6, 7 and 13: 4,720 solves per unit. Writes results.json.gz in
milestone 4f's format (cam = fr1c / fr3c). A checkpoint (partial.jsonl) lets it resume.
"""
import gzip, itertools, json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import third as fresh  # noqa: E402

NK = 2
KEEP = ("f", "cx", "cy", "k1", "k2", "sf", "rms", "cost", "nfev", "status", "ref")
SIZES = (5, 6, 7, 13)
CACHE = {}


def solve(job):
    unit, views, f0 = job
    obs, size = CACHE[unit]
    s = fresh.tu.sc.selfcal_fixed_best(obs[list(views)], size, f0, nk=NK, refs=(0, len(views) // 2))
    if s is not None:
        s = {k: s[k] for k in KEEP}
    return unit, list(views), s


def main():
    cams, jobs = {}, []
    for unit in fresh.THIRD:
        obs, size, names = fresh.load(unit)
        CACHE[unit] = (obs, size)
        cams[unit] = dict(names=names, f0=fresh.f0(unit), size=list(size), nk=NK)
        for n in SIZES:
            jobs += [(unit, v, cams[unit]["f0"]) for v in itertools.combinations(range(13), n)]
    jobs.sort(key=lambda j: (len(j[1]) != 13, j[0] != "fr3c", -len(j[1])))
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
