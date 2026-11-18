"""Milestone 3l, post hoc (written after summary.json was read; not pre-registered): where does the
~1% left after the gyro-aided solve come from? For the first 6 part B sigma = 0.3 windows, solve the
rolling-shutter rendering with the full model (gyro, known t_r, free u) with the pixel noise off and
on, and count how many observations the rolling-shutter and global-shutter renderings share.

    python3 explore.py        # writes explore.json
"""
import json, os, sys
import numpy as np
import importlib.util as ilu

HERE = os.path.dirname(os.path.abspath(__file__))
sp = ilu.spec_from_file_location("r3l", os.path.join(HERE, "run.py")); R = ilu.module_from_spec(sp); sp.loader.exec_module(R)
m3k = R.m3k


def data_noise(spec, t_r, noise):
    rv, tv, X, _ = m3k.window(spec["seed"])
    g = np.random.default_rng(20_000 + spec["seed"])
    vi, pi, uv = m3k.observe(rv, tv, X, np.array(spec["w"]), np.array(spec["u"]), t_r, g, noise=noise)
    return vi, pi, uv, rv, tv, X


def prep(d, seed):
    vi, pi, uv, rv, tv, X = d
    keep = np.bincount(pi, minlength=len(X)) >= 3
    sel = keep[pi]
    remap = -np.ones(len(X), int); remap[keep] = np.arange(keep.sum())
    rng = np.random.default_rng(10_000 + seed)
    rv0 = rv + np.r_[np.zeros((1, 3)), rng.normal(0, 0.01, (m3k.NKF - 1, 3))]
    X0 = X[keep] + rng.normal(0, 0.02, X[keep].shape)
    return vi[sel], remap[pi[sel]], uv[sel], rv0, tv, X0, set(zip(vi[sel].tolist(), np.nonzero(keep)[0][remap[pi[sel]]].tolist()))


def main():
    f = m3k.INTR[0]
    out = []
    for s in [x for x in R.specs() if x.get("sigma") == 0.3][:6]:
        w, u = np.array(s["w"]), np.array(s["u"])
        row = {"seed": s["seed"]}
        for nz in (0.0, 0.5):
            dg = prep(data_noise(s, 0.0, nz), s["seed"])
            dr = prep(data_noise(s, R.TR, nz), s["seed"])
            row[f"shared_obs_frac_{nz}"] = len(dg[6] & dr[6]) / len(dg[6] | dr[6])
            fc = R.solve(dg[:6], w, 0.0)["intr"][0]
            fk = R.solve(dr[:6], w, R.TR, est_u=True)["intr"][0]
            row[f"e_known_u_noise{nz}"] = (fk - fc) / f
            row[f"e_clean_vs_true_noise{nz}"] = (fc - f) / f
        out.append(row)
        print(row, flush=True)
    json.dump(out, open(os.path.join(HERE, "explore.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
