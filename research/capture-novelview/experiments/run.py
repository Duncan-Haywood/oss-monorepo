"""Novel-view synthesis between two ring cameras against ray-traced truth.

    python experiments/run.py            # about 10 s; writes experiments/results.txt
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_novelview.scene import render  # noqa: E402
from capture_novelview.synth import synthesise, psnr  # noqa: E402

GAPS = [4, 8, 15, 30, 45, 60, 90]
BYST = ((0.9, 0.6, 0.22, 1.7),)   # a bystander near the subject, in front of cameras at +-


def one(gap, depth_noise=0.0, bystanders=(), seeds=(0,)):
    """Cameras at +-gap/2 around azimuth 0 (+180 so they face the front); target midway. Returns metrics."""
    base = 20.0
    a, b, t = base - gap / 2, base + gap / 2, base
    ca, za = render(a, bystanders)
    cb, zb = render(b, bystanders)
    truth, zt = render(t, bystanders)
    sky = ~np.isfinite(zt)   # no surface to synthesise: sky is not a hole
    rows = []
    for s in seeds:
        out, have = synthesise([(ca, za, a), (cb, zb, b)], t, depth_noise, s)
        have = have | sky
        rows.append((psnr(out, truth), psnr(out, truth, have), 1 - have.mean()))
    near = psnr(ca if abs(a - t) < abs(b - t) else cb, truth)
    r = np.mean(rows, 0)
    return near, r[0], r[1], r[2]


def main():
    L = []
    L.append("== A. Synthesised midpoint view against ray-traced truth, by gap between the two source cameras (exact depth, no bystander)")
    L.append("gap_deg  nearest_cam_psnr  synth_psnr  synth_psnr_valid  hole_frac")
    for g in GAPS:
        n, p, pv, h = one(g)
        L.append(f"{g:7d}  {n:16.2f}  {p:10.2f}  {pv:16.2f}  {h:9.3f}")
    L.append("")
    L.append("== B. Depth error on the sources (relative sigma), gap 15 degrees")
    L.append("sigma_pct  synth_psnr  hole_frac")
    for s in [0, 0.5, 1, 2, 5, 10]:
        n, p, pv, h = one(15, s / 100, seeds=(0, 1, 2))
        L.append(f"{s:9.1f}  {p:10.2f}  {h:9.3f}")
    L.append("")
    L.append("== C. A bystander in the scene (occlusion), by gap")
    L.append("gap_deg  nearest_cam_psnr  synth_psnr  hole_frac")
    for g in GAPS:
        n, p, pv, h = one(g, bystanders=BYST)
        L.append(f"{g:7d}  {n:16.2f}  {p:10.2f}  {h:9.3f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
