"""Milestone 4i, H59: does the linearised twin predict what the real nonlinear solver does?

    OMP_NUM_THREADS=1 python3 experiments/m4i_geomref/check.py      # ~10 min on 4 cores

Synthetic corners from each camera's twin (its 13-view solve), plus noise, are solved by the same
cold-start solver the real runs used (milestone 4f: selfcal_fixed_best, start f0, reference views
0 and n // 2). For 8 random view sets of each size 3..7 and 40 noise draws per set, the solver's
change in f is compared with the twin's first-order prediction g_S . eps for the same eps.
Noise: iid at the camera's real 13-view rms and at 3x it, and the unit's own residual patterns
(twin.noise 'resid') at the real rms. Writes check.json.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import twin  # noqa: E402
from analyse import load_cam  # noqa: E402

SEED = 202611144
SIZES = (3, 4, 5, 6, 7)
SETS_PER_SIZE = 8
DRAWS = 40
CONFIGS = (("iid", 1.0), ("iid", 3.0), ("resid", 1.0))
CACHE = {}


def jobs_for(cam):
    tw, obs, size, f0 = CACHE[cam]
    rng = np.random.default_rng([SEED, ("left", "right").index(cam)])
    out = []
    for model, mult in CONFIGS:
        E = twin.noise(rng, model, DRAWS, tw) * tw["rms"] * mult      # (13 * 108, DRAWS)
        for n in SIZES:
            for _ in range(SETS_PER_SIZE):
                v = tuple(sorted(rng.choice(13, n, replace=False).tolist()))
                for d in range(DRAWS):
                    out.append((cam, model, mult, v, d, E[:, d]))
    return out


def solve(job):
    cam, model, mult, v, d, e = job
    tw, obs, size, f0 = CACHE[cam]
    w = twin.NPT * 2
    eps = np.concatenate([e[i * w:(i + 1) * w] for i in v])
    clean = twin.project(tw, v)
    s = twin.sc.selfcal_fixed_best(clean + eps.reshape(clean.shape), size, f0, nk=1, refs=(0, len(v) // 2))
    lin = float(twin.gain(tw, v) @ eps)
    nl = float(s["f"] - tw["intr"][0]) if s is not None and s["status"] > 0 else float("nan")
    return dict(cam=cam, model=model, mult=mult, views=list(v), draw=d, lin=lin, nl=nl)


def init():
    for cam in ("left", "right"):
        CACHE[cam] = load_cam(cam)


def summarise(rows):
    out = {}
    keys = sorted({(r["cam"], r["model"], r["mult"], len(r["views"])) for r in rows})
    for cam, model, mult, n in keys:
        sel = [r for r in rows if (r["cam"], r["model"], r["mult"], len(r["views"])) == (cam, model, mult, n)]
        ratios, corrs, far, nconv = [], [], 0, 0
        for v in sorted({tuple(r["views"]) for r in sel}):
            rr = [r for r in sel if tuple(r["views"]) == v]
            lin = np.array([r["lin"] for r in rr]); nl = np.array([r["nl"] for r in rr])
            ok = np.isfinite(nl)
            nconv += int((~ok).sum())
            sd_l = np.std(lin[ok], ddof=1)
            far += int(np.sum(np.abs(nl[ok] - lin[ok]) > 5 * sd_l))
            ratios.append(float(np.std(nl[ok], ddof=1) / sd_l))
            corrs.append(float(np.corrcoef(lin[ok], nl[ok])[0, 1]))
        out[f"{cam}/{model}x{mult:g}/n{n}"] = dict(sd_ratio_median=float(np.median(ratios)),
                                                   sd_ratio_range=[min(ratios), max(ratios)],
                                                   corr_median=float(np.median(corrs)),
                                                   far_from_linear=far, not_converged=nconv, draws=len(sel))
    return out


def main():
    init()
    jobs = jobs_for("left") + jobs_for("right")
    print(len(jobs), "solves", flush=True)
    rows = []
    with Pool(4, initializer=init) as pool:
        for i, r in enumerate(pool.imap_unordered(solve, jobs, chunksize=16)):
            rows.append(r)
            if i % 1000 == 0:
                print(i, flush=True)
    S = summarise(rows)
    h = {cam: [S[f"{cam}/iidx1/n{n}"]["sd_ratio_median"] for n in (4, 5, 6, 7)] for cam in ("left", "right")}
    h["holds"] = bool(all(0.8 <= x <= 1.25 for cam in ("left", "right") for x in h[cam]))
    with open(os.path.join(HERE, "check.json"), "w") as fh:
        json.dump(dict(H59=h, summary=S, seed=SEED, configs=CONFIGS), fh, indent=1)
    print("H59", "holds" if h["holds"] else "REFUTED", json.dumps(h))
    for k, v in S.items():
        print(k, json.dumps(v))
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
