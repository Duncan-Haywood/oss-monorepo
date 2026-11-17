"""Milestone 3i, part B: re-solve the board windows of milestone 3h with the principal point pinned.

Milestones 3f-3h asked whether a short window's focal length goes wrong because its distortion
drifts from the board's; pinning the board's distortion made it worse. The next candidate for what
f compensates is the principal point (c_x, c_y). This script re-uses milestone 3h's 150 windows
(the same seeds, view subsets, starts and free solver, imported unchanged from ../m3h_linear/run.py)
and, for each window and each target c_t = c + t (c_ref - c), t in TS, where c_ref is Zhang's
k1 + k2 principal point of that camera from all 13 views:
  f_c  = first-order conditioned f (Gaussian conditioning on (c_x, c_y), milestone 3g's formula),
  f_p  = the re-solve with c_x, c_y pinned at c_t, started from the free solution,
and, at t = 1 only, the re-solve with all four of c_x, c_y, k1, k2 pinned at the board's values.

    python3 run.py            # ~3 min on 4 cores; writes results.json
H154-H160 were written in ../../LOG.md before this script first ran.
"""
import importlib.util, json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
H3 = os.path.join(HERE, "..", "m3h_linear")
sys.path.insert(0, H3)
_spec = importlib.util.spec_from_file_location("m3h_run", os.path.join(H3, "run.py"))
m3h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m3h)
from pinned import bundle_pinned, intr_cov_pinned, condition  # noqa: E402
import nfba  # noqa: E402
from selfcal import zhang  # noqa: E402

TS = (0.5, 1.0, 2.0)
PIN_C = (1, 2)
PIN_ALL = (1, 2, 3, 4)


def pinned_solve(prob, intr, rv, tv, X, pins, target):
    i0 = np.array(intr, float).copy()
    i0[list(pins)] = target
    info, (ip, *_), qp = bundle_pinned(prob, i0, rv, tv, X, pinned=pins)
    cp, free, sigp = intr_cov_pinned(prob, qp, pinned=pins)
    return {"fp": float(ip[0]), "intr_p": ip.tolist(), "sd_p": float(np.sqrt(cp[0, 0])), "sigma_p": sigp,
            "status_p": info["status"], "cost_p": info["cost"],
            "kept": bool(np.allclose(ip[list(pins)], target, atol=1e-12))}


def one(job):
    cam, n, i, idx = job
    obs, size, ref = CACHE[cam]
    t0 = time.time()
    best = m3h.free_solve(obs[list(idx)], size)
    out = {"cam": cam, "n": n, "i": i, "views": [int(v) for v in idx]}
    if best is None:
        out["why"] = "no_solution"
        return out
    info, (intr, rv, tv, X), q, prob, s = best
    cov, sig, _, _ = nfba.intr_cov(prob, q)
    out.update(why="ok" if info["status"] > 0 else "maxiter", start=s, intr=intr.tolist(), cov=cov.tolist(),
               sigma=sig, cost=info["cost"])
    cref = np.array([ref["cx"], ref["cy"]])
    c = intr[1:3]
    pins = []
    for t in TS:
        ct = c + t * (cref - c)
        fc, ratio_c = condition(intr, cov, PIN_C, ct)
        pins.append({"t": t, "c_target": ct.tolist(), "fc": fc, "sd_ratio_c": ratio_c,
                     **pinned_solve(prob, intr, rv, tv, X, PIN_C, ct)})
    out["pinned"] = pins
    allref = np.array([ref["cx"], ref["cy"], ref["k1"], ref["k2"]])
    fc4, r4 = condition(intr, cov, PIN_ALL, allref)
    out["pinned_all"] = {"fc": fc4, "sd_ratio_c": r4, **pinned_solve(prob, intr, rv, tv, X, PIN_ALL, allref)}
    out["seconds"] = time.time() - t0
    return out


CACHE = {}


def main():
    res = {"sizes": m3h.SIZES, "per_size": m3h.PER_SIZE, "ts": TS, "starts": m3h.STARTS, "cams": {}, "windows": []}
    jobs = []
    for cam in ("left", "right"):
        obs, size = m3h.load(cam)
        z = zhang(list(obs), size, k2=True)
        ref = {k: float(z[k]) for k in ("f", "cx", "cy", "k1", "k2", "sf")}
        CACHE[cam] = (obs, size, ref)
        res["cams"][cam] = {"n_views": len(obs), "size": list(size), "zhang_k1k2": ref}
        rng = np.random.default_rng({"left": 31, "right": 32}[cam])     # milestone 3h's seeds: same windows
        for n in m3h.SIZES:
            for i in range(m3h.PER_SIZE):
                jobs.append((cam, n, i, tuple(sorted(rng.choice(len(obs), size=n, replace=False)))))
    with Pool(4) as pool:
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            res["windows"].append(r)
            if j % 10 == 0:
                print(j, len(jobs), r["cam"], r["n"], r.get("why"), flush=True)
    res["windows"].sort(key=lambda r: (r["cam"], r["n"], r["i"]))
    json.dump(res, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    print("wrote results.json")


if __name__ == "__main__":
    main()
