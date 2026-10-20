"""Measured stereo depth instead of assumed depth noise, fed into the two-view novel-view warp.

    python experiments/run.py            # about a minute; writes experiments/results.txt
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_stereodepth.scene import render, stereo_pair  # noqa: E402
from capture_stereodepth.stereo import match, depth_errors  # noqa: E402
from capture_stereodepth.synth import synthesise, psnr  # noqa: E402

GAP = 15.0          # degrees between the two source cameras (capture-novelview's useful regime)
BASE = 20.0         # target azimuth
BYST = ((0.9, 0.6, 0.22, 1.7),)
BASELINES = [0.03, 0.06, 0.1, 0.2, 0.3, 0.5]


def measure(angle, b, noise, byst, seed):
    lc, lz, rc, _ = stereo_pair(angle, b, byst, noise, seed)
    z, _, _ = match(lc, rc, b)
    e, cov = depth_errors(z, lz)
    return lc, lz, z, e, cov


def one(b, noise=0.0, byst=(), seed=0, gap=GAP):
    a, c, t = BASE - gap / 2, BASE + gap / 2, BASE
    la, za, ma, ea, cova = measure(a, b, noise, byst, seed)
    lb, zb, mb, eb, covb = measure(c, b, noise, byst, seed + 10)
    truth, zt = render(t, byst)
    sky = ~np.isfinite(zt)
    e = np.concatenate([ea, eb])
    out = {"cov": (cova + covb) / 2, "med": float(np.median(e)), "mean": float(e.mean()), "p90": float(np.quantile(e, .9))}
    for name, za_, zb_ in (("meas", ma, mb), ("exact", za, zb)):
        o, have = synthesise([(la, za_, a), (lb, zb_, c)], t)
        out[name] = psnr(o, truth)
        out[name + "_hole"] = 1 - (have | sky).mean()
    # iid relative noise with the same mean absolute error (assumed model of capture-novelview table B)
    sig = out["mean"] * np.sqrt(np.pi / 2)
    o, _ = synthesise([(la, za, a), (lb, zb, c)], t, sig, seed)
    out["iid"], out["sig"] = psnr(o, truth), sig
    out["near"] = psnr(la if abs(a - t) < abs(c - t) else lb, truth)
    return out


def avg(b, noise=0.0, byst=(), gap=GAP, seeds=(0, 1, 2)):
    rs = [one(b, noise, byst, s * 100, gap) for s in seeds]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def main():
    L = []
    L.append("== A. Stereo baseline (m) at 3 m range, sensor noise 0.01, gap 15 deg, no bystander, mean of 3 noise seeds. Depth error is relative, true-surface pixels")
    L.append("baseline_m  coverage  err_median_pct  err_mean_pct  err_p90_pct  psnr_measured  psnr_exact  psnr_iid_same_mean_err  psnr_nearest  hole_frac_measured")
    for b in BASELINES:
        r = avg(b, 0.01)
        L.append(f"{b:10.2f}  {r['cov']:8.3f}  {100*r['med']:14.2f}  {100*r['mean']:12.2f}  {100*r['p90']:11.2f}  {r['meas']:13.2f}  {r['exact']:10.2f}  {r['iid']:22.2f}  {r['near']:12.2f}  {r['meas_hole']:18.3f}")
    L.append("")
    L.append("== B. Sensor noise (sigma per channel, 0-1 scale), baseline 0.2 m")
    L.append("noise  coverage  err_median_pct  err_mean_pct  psnr_measured  psnr_iid_same_mean_err  psnr_nearest")
    for n in [0.0, 0.01, 0.03, 0.06, 0.1]:
        r = avg(0.2, n)
        L.append(f"{n:5.2f}  {r['cov']:8.3f}  {100*r['med']:14.2f}  {100*r['mean']:12.2f}  {r['meas']:13.2f}  {r['iid']:22.2f}  {r['near']:12.2f}")
    L.append("")
    L.append("== C. A bystander in the scene, baseline 0.2 m, sensor noise 0.01")
    L.append("gap_deg  coverage  err_mean_pct  psnr_measured  psnr_exact  psnr_nearest")
    for g in [8, 15, 30]:
        r = avg(0.2, 0.01, BYST, gap=g)
        L.append(f"{g:7d}  {r['cov']:8.3f}  {100*r['mean']:12.2f}  {r['meas']:13.2f}  {r['exact']:10.2f}  {r['near']:12.2f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
