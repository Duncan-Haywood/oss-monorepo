"""Milestone 3r: on TUM, a Gaussian prior on k1 and the principal point drawn from the same camera's
other windows (a fleet memory, no calibration target), added to milestone 3n's rolling-shutter window solve.

Usage: OMP_NUM_THREADS=1 python3 run.py <tum dir> [n_workers] [limit]
<tum dir> holds the sequences extracted by ../m3b_natural/fetch.sh. Writes results.json
(partial.jsonl checkpoints finished windows, so a rerun resumes).

Per window: milestone 3b's nfba start, then milestone 3n's `est` model (mocap rates, u = 0, readout free
from 0, all five intrinsics free) with prior residuals r_j = sigma_px (p_j - mu_j) / s_j on chosen
intrinsics. sigma_px is the window's own `est` rms (milestone 3p's results), so the prior is in units of
that window's pixel noise. mu and s are the median and robust sd (1.4826 MAD) of milestone 3p's `est`
values over the OTHER counted windows of the same camera (leave-one-window-out), or, for est_px, over the
other fr1 sequence's counted windows. Plan and hypotheses: LOG.md, milestone 3r planned.

    est_p    cx, cy, k1   width s
    est_ph   cx, cy, k1   width s / 2
    est_pk1  k1           width s
    est_px   cx, cy, k1   width s, from the other fr1 sequence (Kinect only)
"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
for p in ("m3b_natural", "m3l_gyro", "m3o_offset", "m3n_tumrs"):
    sys.path.insert(0, os.path.join(EXP, p))
import nfba  # noqa: E402
import rsba  # noqa: E402
import tsba  # noqa: E402
import importlib.util  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


m3b = _load("m3b_run", os.path.join(EXP, "m3b_natural", "run.py"))
m3n = _load("m3n_run", os.path.join(EXP, "m3n_tumrs", "run.py"))
m3n_an = _load("m3n_an", os.path.join(EXP, "m3n_tumrs", "analyse.py"))

SIZE, H = (640, 480), 480
D = 0.020                        # s, rate differencing half-span (milestone 3n)
PRIOR_IDX = {"cx": 1, "cy": 2, "k1": 3}
MODELS = {"est_p": (("cx", "cy", "k1"), 1.0, "loo"),
          "est_ph": (("cx", "cy", "k1"), 0.5, "loo"),
          "est_pk1": (("k1",), 1.0, "loo"),
          "est_px": (("cx", "cy", "k1"), 1.0, "cross")}


def mad_sd(x):
    x = np.asarray(x, float)
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


class PWindow(tsba.TWindow):
    """tsba.TWindow (rates fixed, u = 0) plus Gaussian prior residuals on intrinsics.
    prior: list of (index into intr, mu, scale) with residual (intr[j] - mu) / scale."""

    def __init__(self, *a, prior=(), **k):
        super().__init__(*a, **k)
        self.prior = [(int(j), float(mu), float(sc)) for j, mu, sc in prior]

    def prior_cost(self, c):
        return float(sum(((c[j] - mu) / sc) ** 2 for j, mu, sc in self.prior))

    def image_cost(self, c, x):
        return super().cost(c, x)

    def cost(self, c, x):
        return self.image_cost(c, x) + self.prior_cost(c)

    def blocks(self, c, x):
        U, Wp, V, gc, gp, r2, w = super().blocks(c, x)
        U, gc = U.copy(), gc.copy()
        for j, mu, sc in self.prior:      # intr sits at c[0:5] in every layout used here
            U[j, j] += 1.0 / sc ** 2
            gc[j] += (c[j] - mu) / sc ** 2
        return U, Wp, V, gc, gp, r2, w

    def solve(self, *a, **k):
        out = super().solve(*a, **k)
        intr = np.array(out["intr"])
        out["prior_cost"] = float(sum(((intr[j] - mu) / sc) ** 2 for j, mu, sc in self.prior))
        out["image_cost"] = out["cost"] - out["prior_cost"]
        return out


def priors(res):
    """Per counted window: {model: [(j, mu, s), ...]} with mu, s from milestone 3p's est (sd scale 1)."""
    rows = [w for w in res["windows"] if m3n_an.counted(w)[0]]
    out = {}
    for w in rows:
        key = (w["seq"], w["window"])
        same = [v for v in rows if v["unit"] == w["unit"] and (v["seq"], v["window"]) != key]
        other = [v for v in rows if v["unit"] == "fr1" and v["seq"] != w["seq"]] if w["unit"] == "fr1" else None
        p = {}
        for m, (names, width, src) in MODELS.items():
            pool = same if src == "loo" else other
            if pool is None:
                continue
            p[m] = []
            for nm in names:
                j = PRIOR_IDX[nm]
                vals = [v["solves"]["est"]["intr"][j] for v in pool]
                p[m].append((j, float(np.median(vals)), width * mad_sd(vals)))
        out[key] = {"priors": p, "rms_est": w["solves"]["est"]["rms_px"],
                    "nfba_f": w["nfba"]["intr"][0], "est": w["solves"]["est"]}
    return out


def job(args):
    tum, key, w, info, best = args
    t0 = time.time()
    d = os.path.join(tum, m3b.SEQS[key][0])
    fr = m3b.frames(d)
    gt = m3b.groundtruth(d)
    nk = m3b.NKF * m3b.STEP
    idx = [w * nk + i * m3b.STEP for i in range(m3b.NKF)]
    kt = np.array([fr[i][0] for i in idx])
    out = {"seq": key, "unit": m3b.SEQS[key][1], "window": w, "frames": [idx[0], idx[-1]]}
    rates = np.array([m3n.body_rate(gt, t, D) for t in kt])
    feats = [nfba.features(cv2.imread(os.path.join(d, fr[i][1]), cv2.IMREAD_GRAYSCALE)) for i in idx]
    r = nfba.solve_window(feats, SIZE, best["f0"])
    if "intr" not in r:
        out["status"] = r["status"]
        return out
    vi, pi, uv, X = r.pop("data")
    rv, tv = np.array(r.pop("rv")), np.array(r.pop("tv"))
    out["nfba_f"] = r["intr"][0]
    out["nfba_f_3p"] = info["nfba_f"]
    intr0 = np.array(r["intr"])
    sig = info["rms_est"]
    gs = kt.copy()
    sols = {}
    for m, pr in info["priors"].items():
        win = PWindow(vi, pi, uv, m3b.NKF, len(X), tv, gs, -rates, kt, 0.0, H, est_tr=True,
                      est_delta=False, prior=[(j, mu, sc / sig) for j, mu, sc in pr])
        win.gyro = -rates
        win.rates = lambda delta, _g=-rates: _g
        sols[m] = win.solve(intr0, rv, tv, X, 0.0)
        sols[m]["prior"] = pr
    # est's image cost from milestone 3p, recomputed here is unnecessary: est has no prior, so its
    # cost is its image cost.
    out["solves"] = sols
    out["status"] = "ok"
    out["seconds"] = time.time() - t0
    return out


def main():
    tum = sys.argv[1]
    nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    res3p = json.load(open(os.path.join(EXP, "m3p_tumvel", "results.json")))
    pri = priors(res3p)
    best = m3n.m3b_best()
    jobs = [(tum, k[0], k[1], v, best[k]) for k, v in sorted(pri.items())]
    jobs = jobs[:limit] if limit else jobs
    part = os.path.join(HERE, "partial.jsonl" if not limit else "pilot.jsonl")
    res = [json.loads(l) for l in open(part)] if os.path.exists(part) else []
    done = {(r["seq"], r["window"]) for r in res}
    todo = [j for j in jobs if (j[1], j[2]) not in done]
    print(len(jobs), "windows,", len(todo), "to run", flush=True)
    with Pool(nw) as p, open(part, "a") as fh:
        for r in p.imap_unordered(job, todo):
            res.append(r)
            fh.write(json.dumps(r) + "\n"); fh.flush()
            print(r["seq"], r["window"], r["status"], round(r.get("seconds", 0)),
                  {k: (round(v["intr"][0], 1), v["status"]) for k, v in r.get("solves", {}).items()}, flush=True)
    res.sort(key=lambda r: (r["seq"], r["window"]))
    if not limit:
        with open(os.path.join(HERE, "results.json"), "w") as fh:
            json.dump({"models": {k: list(v) for k, v in MODELS.items()}, "windows": res}, fh, indent=1)
        os.remove(part)
    print("EXIT", flush=True)


if __name__ == "__main__":
    main()
