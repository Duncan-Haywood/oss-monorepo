"""Real buck converter: physics-shaped twin vs ARX, both directions, with a block bootstrap."""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import buckreal as b  # noqa: E402

DELAYS = (0, 1, 2, 5, 10, 20)
ARX = [(1, 1), (2, 2), (3, 3), (4, 4), (6, 6), (10, 10)]


def block_boot_diff(ea, eb, block=100, n=2000, seed=0):
    """Mean difference of squared errors, resampling blocks; returns (rmse_a - rmse_b) interval."""
    rng = np.random.default_rng(seed)
    m = len(ea); nb = m // block
    out = []
    for _ in range(n):
        idx = rng.integers(0, nb, nb)
        sa = np.concatenate([ea[i * block:(i + 1) * block] for i in idx])
        sb = np.concatenate([eb[i * block:(i + 1) * block] for i in idx])
        out.append(np.sqrt(np.mean(sa ** 2)) - np.sqrt(np.mean(sb ** 2)))
    return [float(x) for x in np.percentile(out, [2.5, 50, 97.5])]


def direction(tr, te):
    (u, y), (uv, yv) = tr, te
    res = {"const": b.rmse(np.full_like(yv, y.mean()), yv)}
    # delay chosen on the training trace only
    best = {}
    for s in ("linear", "hammerstein"):
        scores = {}
        for d in DELAYS:
            p = b.fit_twin(u, y, s, d)
            scores[d] = (b.rmse(b.twin_sim(p, u, s, d), y), p)
        d = min(scores, key=lambda k: scores[k][0])
        p = scores[d][1]
        sim = b.twin_sim(p, uv, s, d)
        res[s] = {"delay": d, "train": scores[d][0], "test": b.rmse(sim, yv), "params": [float(x) for x in p]}
        best[s] = sim
    arx = {}
    for na, nb in ARX:
        th = b.fit_arx(u, y, na, nb); k = max(na, nb)
        sim = b.sim_arx(th, uv, yv, na, nb)
        arx[f"{na}/{nb}"] = {"npar": na + nb + 1, "train": b.rmse(b.sim_arx(th, u, y, na, nb), y, k),
                             "test": b.rmse(sim, yv, k)}
        best[f"arx{na}/{nb}"] = sim
    res["arx"] = arx
    e = lambda s: (s - yv)[10:]
    res["boot_arx22_minus_hammerstein"] = block_boot_diff(e(best["arx2/2"]), e(best["hammerstein"]))
    res["boot_arx22_minus_linear"] = block_boot_diff(e(best["arx2/2"]), e(best["linear"]))
    return res, best


if __name__ == "__main__":
    a, ya = b.load("buck_id"); c, yc = b.load("buck_valid")
    fwd, sims = direction((a, ya), (c, yc))
    rev, _ = direction((c, yc), (a, ya))
    out = {"quantisation_floor_V": 0.2 / 12 ** 0.5, "id_to_valid": fwd, "valid_to_id": rev}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    np.savez(os.path.join(HERE, "valid_sims.npz"), y=yc, hammerstein=sims["hammerstein"],
             linear=sims["linear"], arx22=sims["arx2/2"], u=c)
    L = [f"quantisation floor (0.2 V / sqrt 12): {out['quantisation_floor_V']:.3f} V"]
    for name, r in (("fit on first 10 ms, test on next 10 ms", fwd), ("fit on next 10 ms, test on first 10 ms", rev)):
        L += ["", name, f"  constant (train mean): {r['const']:.3f} V"]
        for s in ("linear", "hammerstein"):
            L.append(f"  twin {s:11s} delay {r[s]['delay']:2d}: train {r[s]['train']:.3f}  test {r[s]['test']:.3f} V")
        for k, v in r["arx"].items():
            L.append(f"  ARX {k:6s} ({v['npar']:2d} par): train {v['train']:.3f}  test {v['test']:.3f} V")
        L.append("  free-run RMSE ARX 2/2 minus twin, block-bootstrap 2.5/50/97.5%: hammerstein "
                 + " ".join(f"{x:+.3f}" for x in r["boot_arx22_minus_hammerstein"])
                 + "; linear " + " ".join(f"{x:+.3f}" for x in r["boot_arx22_minus_linear"]))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
