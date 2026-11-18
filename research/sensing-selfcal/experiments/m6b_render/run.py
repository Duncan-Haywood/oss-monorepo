"""Milestone 6b: render each camera's 13 views from a known camera at the real poses and score
three corner localisers and two calibrations against the truth.

    OMP_NUM_THREADS=1 python3 experiments/m6b_render/measure.py
    OMP_NUM_THREADS=1 python3 experiments/m6b_render/run.py        # ~30 min on 4 cores

Truth: each camera's all-view flat-board Zhang fit (k1 + k2) on the real 11x11 corners, and
that fit's 13 poses. Step 1 renders each view's area-sampled image once. Step 2 calibrates the
matched blur and noise so that measure.py's statistics on renders equal those on the real
images (the render's area sampling and JPEG change both, so the raw measurement is the
target, not the input). Step 3: 5 settings x 20 seeds x 2 cameras; for each, the 3 localisers,
flat-board Zhang (k1 + k2) and target-free BA (k1 + k2) on all 13 views.
Writes calib.json and results.json.gz.
"""
import glob, gzip, json, os, sys, time
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
from selfcal import (detect, zhang, project, board_points, match_order,  # noqa: E402
                     selfcal_fixed_analytic, neighbour_corr)
from render import render_clean, degrade, noise_sigma, edge_sigmas  # noqa: E402

METHODS = ("subpix11", "subpix5", "sb")
SEEDS = 20
CAL_VIEWS = (0, 4, 8, 12)
CLEAN, TRUTH = {}, {}


def truth_camera(cam):
    cs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", f"{cam}*.jpg"))):
        c, size = detect(f)
        cs.append(c)
    z = zhang(cs, size, k2=True)
    intr = np.array([z["f"], z["cx"], z["cy"], z["k1"], z["k2"]])
    proj = np.array([project(intr, r, t, board_points(), 2)[0] for r, t in zip(z["rvecs"], z["tvecs"])])
    return dict(intr=intr, rvecs=z["rvecs"], tvecs=z["tvecs"], size=size, proj=proj)


def _render(job):
    cam, v, intr, rv, tv, size, lv = job
    return cam, v, render_clean(intr, rv, tv, size, lv)


def stats(cam, blur, noise, seed=999):
    rng = np.random.default_rng(seed)
    e, n = [], []
    for v in CAL_VIEWS:
        img = degrade(CLEAN[cam][v], blur, noise, rng)
        e.append(edge_sigmas(img, TRUTH[cam]["proj"][v])); n.append(noise_sigma(img, TRUTH[cam]["proj"][v]))
    return float(np.median(np.concatenate(e))), float(np.median(n))


def calibrate(cam, target):
    """Grid then linear interpolation: blur first (with the raw noise), then noise."""
    bs = np.arange(0.4, 1.21, 0.05)
    eb = np.array([stats(cam, b, target["noise"])[0] for b in bs])
    blur = float(np.interp(target["edge_sigma_median"], eb, bs))
    ns = np.arange(0.0, 3.01, 0.25)
    nn = np.array([stats(cam, blur, n)[1] for n in ns])
    noise = float(np.interp(target["noise"], nn, ns))
    got = stats(cam, blur, noise, seed=12345)
    return dict(blur=blur, noise=noise, check_edge=got[0], check_noise=got[1],
                grid_blur=[bs.tolist(), eb.tolist()], grid_noise=[ns.tolist(), nn.tolist()])


def one(job):
    cam, setting, blur, noise, seed = job
    t0 = time.time()
    T = TRUTH[cam]
    rng = np.random.default_rng(10_000 + seed + (0 if cam == "left" else 5_000) + 100 * ["matched", "blur_half", "blur_double", "noise_zero", "noise_double"].index(setting))
    imgs = [degrade(CLEAN[cam][v], blur, noise, rng) for v in range(13)]
    out = dict(cam=cam, setting=setting, seed=seed, blur=blur, noise=noise, methods={})
    f_true = float(T["intr"][0])
    for m in METHODS:
        cs, ok = [], True
        for v, img in enumerate(imgs):
            c, size = detect(img, method=m)
            if c is None:
                ok = False; break
            try:
                cs.append(match_order(T["proj"][v], c))
            except ValueError:
                ok = False; break
        if not ok:
            out["methods"][m] = None
            continue
        obs = np.array(cs)
        err = obs - T["proj"]
        z = zhang(list(obs), size, k2=True)
        best = None
        for ref in (0, 6):
            try:
                s = selfcal_fixed_analytic(obs, size, 1.1 * f_true, nk=2, ref=ref, keep_resid=True)
            except Exception:
                continue
            if best is None or s["cost"] < best["cost"]:
                best = s
        rc = neighbour_corr(best["resid"]) if best else None
        out["methods"][m] = dict(
            err=np.round(err, 4).tolist(),
            zhang=dict(f=z["f"], cx=z["cx"], cy=z["cy"], k1=z["k1"], k2=z["k2"], sf=z["sf"], rms=z["rms"]),
            selfcal=None if best is None else dict(f=best["f"], sf=best["sf"], cx=best["cx"], cy=best["cy"],
                                                   k1=best["k1"], k2=best["k2"], rms=best["rms"], status=best["status"],
                                                   sf_cr_view=best.get("sf_cr_view")),
            resid_corr=rc)
    out["seconds"] = time.time() - t0
    return out


def main():
    meas = json.load(open(os.path.join(HERE, "measure.json")))
    for cam in ("left", "right"):
        TRUTH[cam] = truth_camera(cam)
        CLEAN[cam] = {}
    jobs = []
    for cam in ("left", "right"):
        T, M = TRUTH[cam], meas[cam]
        lv = (M["dark"], M["bright"], M["image_median"])
        jobs += [(cam, v, T["intr"], T["rvecs"][v], T["tvecs"][v], T["size"], lv) for v in range(13)]
    with Pool(4) as pool:
        for cam, v, img in pool.imap_unordered(_render, jobs):
            CLEAN[cam][v] = img
    print("rendered", flush=True)
    calib = {}
    for cam in ("left", "right"):
        calib[cam] = calibrate(cam, meas[cam])
        calib[cam]["truth"] = dict(zip(["f", "cx", "cy", "k1", "k2"], TRUTH[cam]["intr"].tolist()))
        print(cam, {k: v for k, v in calib[cam].items() if not k.startswith("grid")}, flush=True)
    json.dump(calib, open(os.path.join(HERE, "calib.json"), "w"), indent=1)
    jobs = []
    for cam in ("left", "right"):
        b, n = calib[cam]["blur"], calib[cam]["noise"]
        settings = dict(matched=(b, n), blur_half=(b / 2, n), blur_double=(2 * b, n), noise_zero=(b, 0.0), noise_double=(b, 2 * n))
        for name, (bb, nn) in settings.items():
            jobs += [(cam, name, bb, nn, s) for s in range(SEEDS)]
    res = []
    with Pool(4) as pool:  # forked after CLEAN and TRUTH are filled
        for j, r in enumerate(pool.imap_unordered(one, jobs)):
            res.append(r)
            if j % 10 == 0:
                print(j, "/", len(jobs), r["cam"], r["setting"], round(r["seconds"], 1), flush=True)
    res.sort(key=lambda r: (r["cam"], r["setting"], r["seed"]))
    out = dict(calib=calib, truth_proj={c: np.round(TRUTH[c]["proj"], 5).tolist() for c in TRUTH}, runs=res)
    with gzip.open(os.path.join(HERE, "results.json.gz"), "wt") as fh:
        json.dump(out, fh)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
