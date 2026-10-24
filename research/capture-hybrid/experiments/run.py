"""Does falling back to the nearest camera, or filling holes, fix synthesis from measured stereo depth?

    python experiments/run.py            # writes experiments/results.txt
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_hybrid.scene import render, stereo_pair  # noqa: E402
from capture_hybrid.stereo import match  # noqa: E402
from capture_hybrid.synth import psnr  # noqa: E402
from capture_hybrid.hybrid import make  # noqa: E402

BASE = 20.0
BYST = ((0.9, 0.6, 0.22, 1.7),)
STRATS = ["plain", "fill", "fallback", "gate", "oracle"]


def scene_inputs(gap, b, noise, byst, seed):
    a, c, t = BASE - gap / 2, BASE + gap / 2, BASE
    srcs = []
    for ang, s in ((a, seed), (c, seed + 10)):
        lc, _, rc, _ = stereo_pair(ang, b, byst, noise, s)
        z, _, _ = match(lc, rc, b)
        srcs.append((lc, z, ang))
    truth, _ = render(t, byst)
    nearest = min(srcs, key=lambda s: abs(s[2] - t))[0]
    return srcs, t, truth, nearest


def avg(gap=15.0, b=0.2, noise=0.01, byst=(), seeds=(0, 1, 2), tau=0.3, grow=1):
    acc = {k: [] for k in STRATS + ["near"]}
    for s in seeds:
        srcs, t, truth, nearest = scene_inputs(gap, b, noise, byst, s * 100)
        for k in STRATS:
            acc[k].append(psnr(make(k, srcs, t, tau, grow, truth), truth))
        acc["near"].append(psnr(nearest, truth))
    return {k: float(np.mean(v)) for k, v in acc.items()}


def row(label, r):
    return f"{label:>10}  " + "  ".join(f"{r[k]:8.2f}" for k in STRATS + ["near"])


def main():
    H = "           " + "  ".join(f"{k:>8}" for k in STRATS + ["near"])
    L = ["== A. Strategy by gap between the source cameras (stereo baseline 0.2 m, sensor noise 0.01, no bystander); PSNR dB, mean of 3 seeds", H]
    for g in [8, 15, 30]:
        L.append(row(f"gap {g}", avg(gap=g)))
    L += ["", "== B. Strategy by stereo baseline (gap 15 deg)", H]
    for b in [0.06, 0.2, 0.5]:
        L.append(row(f"b {b}", avg(b=b)))
    L += ["", "== C. Strategy by sensor noise (gap 15 deg, baseline 0.2 m)", H]
    for n in [0.0, 0.03, 0.06]:
        L.append(row(f"noise {n}", avg(noise=n)))
    L += ["", "== D. With a bystander (baseline 0.2 m, sensor noise 0.01)", H]
    for g in [8, 15, 30]:
        L.append(row(f"gap {g}", avg(gap=g, byst=BYST)))
    L += ["", "== E. Gate threshold tau (summed |RGB| difference between the two warps; gap 15 deg, no bystander)", "tau   gate_psnr"]
    for tau in [0.05, 0.1, 0.2, 0.3, 0.5, 1.0]:
        L.append(f"{tau:4.2f}  {avg(tau=tau)['gate']:9.2f}")
    L += ["", "== F. Held out: fresh noise seeds (7, 8, 9), tau fixed at 0.3 before the sweep in E (gap 15 deg, baseline 0.2 m, noise 0.01)", H]
    L.append(row("no bystand", avg(seeds=(7, 8, 9))))
    L.append(row("bystander", avg(seeds=(7, 8, 9), byst=BYST)))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
