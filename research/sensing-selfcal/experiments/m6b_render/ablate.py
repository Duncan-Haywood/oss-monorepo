"""Milestone 6b, unscored ablation (decided after H33 was refuted): what reproduces the real
11x11 ring errors? Renders the 13 views of each camera with the matched blur and noise
(calib.json) and different surrounds: white margin of 0.5 or 0.15 squares, background mid-grey
(the real images' median) or as dark as the black squares; and, after outer.py found the real
board's end columns reach only about half a square past the last corner, the same with
half-width end squares (xreach 0.5). 5 seeds each. Writes ablate.json.

    OMP_NUM_THREADS=1 python3 experiments/m6b_render/ablate.py      # ~5 min on 4 cores
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, HERE)
from selfcal import detect, zhang, match_order  # noqa: E402
from render import render_clean, degrade  # noqa: E402
from run import truth_camera, METHODS  # noqa: E402
from analyse import ring_mask, rms  # noqa: E402

SURROUNDS = {"margin0.5_grey": (0.5, "grey", 1.0), "margin0.15_grey": (0.15, "grey", 1.0),
             "margin0.5_dark": (0.5, "dark", 1.0), "margin0.15_dark": (0.15, "dark", 1.0),
             "halfend_margin0.5_grey": (0.5, "grey", 0.5), "halfend_margin0.15_grey": (0.15, "grey", 0.5),
             "halfend_margin0.15_dark": (0.15, "dark", 0.5)}
SEEDS = 5


def job(args):
    cam, name, T, M, C = args
    margin, bgk, xreach = SURROUNDS[name]
    lv = (M["dark"], M["bright"], M["image_median"] if bgk == "grey" else M["dark"])
    clean = [render_clean(T["intr"], T["rvecs"][v], T["tvecs"][v], T["size"], lv, margin=margin, xreach=xreach) for v in range(13)]
    ring = ring_mask()
    out = dict(cam=cam, surround=name, seeds=[])
    for s in range(SEEDS):
        rng = np.random.default_rng(777 + s)
        imgs = [degrade(c, C["blur"], C["noise"], rng) for c in clean]
        rec = {}
        for m in METHODS:
            cs = []
            for v, img in enumerate(imgs):
                c, size = detect(img, method=m)
                if c is None:
                    break
                try:
                    cs.append(match_order(T["proj"][v], c))
                except ValueError:
                    break
            if len(cs) < 13:
                rec[m] = None
                continue
            obs = np.array(cs)
            n = np.linalg.norm(obs - T["proj"], axis=-1)
            z = zhang(list(obs), size, k2=True)
            rec[m] = dict(rms_ring=rms(n[:, ring]), rms_interior=rms(n[:, ~ring]), max=float(n.max()),
                          n_over1=int((n > 1).sum()), n_over1_ring=int((n[:, ring] > 1).sum()),
                          zhang_f_err_pct=float((z["f"] - T["intr"][0]) / T["intr"][0] * 100))
        out["seeds"].append(rec)
    return out


def main():
    meas = json.load(open(os.path.join(HERE, "measure.json")))
    calib = json.load(open(os.path.join(HERE, "calib.json")))
    jobs = []
    for cam in ("left", "right"):
        T = truth_camera(cam)
        jobs += [(cam, name, T, meas[cam], calib[cam]) for name in SURROUNDS]
    with Pool(4) as pool:
        res = pool.map(job, jobs)
    summ = {}
    for r in res:
        d = {}
        for m in METHODS:
            ok = [s[m] for s in r["seeds"] if s[m]]
            d[m] = None if not ok else {k: float(np.mean([o[k] for o in ok])) for k in ok[0]} | {"n_ok": len(ok)}
        summ[f'{r["cam"]}/{r["surround"]}'] = d
        print(r["cam"], r["surround"], {m: None if v is None else {k: round(x, 3) for k, x in v.items()} for m, v in d.items()}, flush=True)
    json.dump(summ, open(os.path.join(HERE, "ablate.json"), "w"), indent=1)
    print("DONE")


if __name__ == "__main__":
    main()
