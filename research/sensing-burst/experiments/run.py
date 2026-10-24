"""Writes experiments/results.txt. Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_burst import (make_canvas, render, capture, estimate_shift, merge,
                           display_psnr, breakeven_frames, var_large, var_burst, var_burst_fixed_time)

HERE = os.path.dirname(__file__)
SIZE, UP, PAD = 48, 4, 4
TRIALS = 16
NS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]
out = []


def p(s=""):
    print(s)
    out.append(s)


def scene(seed, hdr=0.0):
    c = make_canvas(SIZE, UP, PAD, hdr, seed)
    return c, render(c, (0, 0), SIZE, UP, PAD)


def crossing(ns, psnr, target):
    """Smallest N (linear interpolation between grid points) where psnr reaches target; None if never."""
    for i in range(len(ns)):
        if psnr[i] >= target:
            if i == 0:
                return float(ns[0])
            f = (target - psnr[i - 1]) / (psnr[i] - psnr[i - 1])
            return ns[i - 1] + f * (ns[i] - ns[i - 1])
    return None


def noise_only(A, read, P_l, seeds):
    """Mean-PSNR curves for N small frames (no motion) and one large frame, equal exposure time per frame."""
    s = P_l / A
    acc = np.zeros(len(NS))
    big = 0.0
    xbar = 0.0
    for sd in seeds:
        rng = np.random.default_rng(1000 + sd)
        _, truth = scene(sd)
        xbar += truth.mean() / len(seeds)
        fr = np.stack([capture(truth, s, 1e12, read, rng) for _ in range(max(NS))])
        cs = np.cumsum(fr, axis=0)
        for i, n in enumerate(NS):
            acc[i] += display_psnr(cs[n - 1] / n / s, truth) / len(seeds)
        big += display_psnr(capture(truth, P_l, 1e12, read, rng) / P_l, truth) / len(seeds)
    return acc, big, xbar


p("# sensing-burst: small-sensor burst vs one frame of a larger sensor (synthetic scenes, Poisson-Gaussian noise)")
p(f"{SIZE}x{SIZE} px scenes, {TRIALS} scenes per cell; PSNR is display-referred (gamma 1/2.2, scene peak = 1), border cropped.")
p("A = area ratio (large/small pixel); P = electrons per unit radiance in ONE large-sensor frame; read = read noise (e-).")
p("Small sensor has P/A electrons per unit radiance per frame. Equal exposure time per frame (the burst takes N times longer).")

# A. break-even frame count, no motion
p("\n== A. Frames N* for the small-sensor burst to match one large frame (no motion, perfect merge)")
p("A read P | N*_sim | N*_formula(mean radiance) | N*_formula(radiance 0.1) | A^2 | large_psnr")
cache = {}
for A in (2, 4, 8):
    for read in (2.0, 8.0):
        for P in (30.0, 300.0, 3000.0):
            acc, big, xbar = noise_only(A, read, P, range(TRIALS))
            cache[(A, read, P)] = (acc, big)
            ns = crossing(NS, acc, big)
            f1 = breakeven_frames(xbar, P / A, A, read)
            f2 = breakeven_frames(0.1, P / A, A, read)
            p(f"{A} {read:g} {P:g} | {'>64' if ns is None else format(ns, '.1f')} | {f1:.1f} | {f2:.1f} | {A*A} | {big:.2f}")

A_, r_, P_ = 4, 8.0, 300.0
acc, big = cache[(A_, r_, P_)]
p(f"\n== A1. PSNR (dB) against N for A={A_}, read={r_:g}, P={P_:g}")
p("N burst large")
for n, v in zip(NS, acc):
    p(f"{n} {v:.2f} {big:.2f}")

# B. closed-form variance sanity check against pixel-level Monte Carlo
p("\n== B. Closed-form variance of the radiance estimate vs 4000 Monte Carlo draws of one pixel (x = 0.4, A = 4, read = 3, s = 50)")
rng = np.random.default_rng(7)
x, s, A, read = 0.4, 50.0, 4, 3.0
mc_l = np.var((rng.poisson(A * s * x, 4000) + read * rng.standard_normal(4000)) / (A * s))
for N in (1, 4, 16):
    mc_b = np.var(((rng.poisson(s * x, (4000, N)) + read * rng.standard_normal((4000, N))).sum(1)) / (N * s))
    p(f"burst N={N}: formula {var_burst(x, s, N, read):.3e} MC {mc_b:.3e}")
p(f"large: formula {var_large(x, s, A, read):.3e} MC {mc_l:.3e}")
p(f"N* formula {breakeven_frames(x, s, A, read):.2f}")

# C. fixed total exposure time
p("\n== C. Same total exposure time as the large frame (N frames each with 1/N of the light), A=4, read=3, P=300")
p("N | variance ratio burst/large at x=0.4 | PSNR burst | PSNR large")
Af, rf, Pf = 4, 3.0, 300.0
for N in (1, 2, 4, 8, 16):
    sN = Pf / Af
    ratio = var_burst_fixed_time(0.4, sN, N, rf) / var_large(0.4, sN, Af, rf)
    ps, pl = [], []
    for sd in range(TRIALS):
        rng = np.random.default_rng(2000 + sd)
        _, truth = scene(sd)
        fr = [capture(truth, sN / N, 1e12, rf, rng) for _ in range(N)]
        ps.append(display_psnr(np.sum(fr, axis=0) / sN, truth))
        pl.append(display_psnr(capture(truth, Pf, 1e12, rf, rng) / Pf, truth))
    p(f"{N} | {ratio:.2f} | {np.mean(ps):.2f} | {np.mean(pl):.2f}")


def handheld(A, read, P_l, N, seeds, max_hr=8):
    """PSNR of the small-sensor burst merged with known shifts, estimated shifts, and no registration."""
    s = P_l / A
    res = {"known": [], "estimated": [], "none": []}
    err = []
    for sd in seeds:
        rng = np.random.default_rng(3000 + sd)
        canvas, truth = scene(sd)
        sh = [(0, 0)] + [tuple(rng.integers(-max_hr, max_hr + 1, 2)) for _ in range(N - 1)]
        fr = [capture(render(canvas, h, SIZE, UP, PAD), s, 1e12, read, rng) for h in sh]
        ts = [1.0] * N
        known = [(h[0] / UP, h[1] / UP) for h in sh]
        est = [estimate_shift(fr[0], f) for f in fr]
        est[0] = (0.0, 0.0)
        err += [np.hypot(e[0] - k[0], e[1] - k[1]) for e, k in zip(est[1:], known[1:])]
        res["known"].append(display_psnr(merge(fr, ts, s, 1e12, known), truth))
        res["estimated"].append(display_psnr(merge(fr, ts, s, 1e12, est), truth))
        res["none"].append(display_psnr(np.mean(fr, axis=0) / s, truth))
    return {k: float(np.mean(v)) for k, v in res.items()}, float(np.sqrt(np.mean(np.square(err)))) if err else 0.0


def large_psnr(P, seeds):
    return float(np.mean([display_psnr(capture(scene(sd)[1], P, 1e12, 3.0, np.random.default_rng(4000 + sd)) / P,
                                       scene(sd)[1]) for sd in seeds]))


p("\n== D. Hand shake (random shifts up to +-2 px in quarter-pixel steps), A=4, read=3, N=8 frames")
p("P | PSNR known | PSNR estimated | PSNR unregistered | large frame | RMS shift error (px)")
for P in (30.0, 100.0, 300.0, 3000.0):
    r, e = handheld(4, 3.0, P, 8, range(TRIALS))
    p(f"{P:g} | {r['known']:.2f} | {r['estimated']:.2f} | {r['none']:.2f} | {large_psnr(P, range(TRIALS)):.2f} | {e:.3f}")

p("\n== D2. Frames needed with alignment, A=4, read=3 (interpolated N matching one large frame; grid 4,6,8,12,16,24,32)")
p("P | N* known | N* estimated")
Ng = [4, 6, 8, 12, 16, 24, 32]
for P in (100.0, 300.0, 3000.0):
    curves = {"known": [], "estimated": []}
    for N in Ng:
        r, _ = handheld(4, 3.0, P, N, range(8))
        for k in curves:
            curves[k].append(r[k])
    pl = large_psnr(P, range(8))
    fk, fe = (crossing(Ng, curves[k], pl) for k in ("known", "estimated"))
    fmt = lambda v: "<=4 or >32" if v is None else f"{v:.1f}"
    p(f"{P:g} | {fmt(fk)} | {fmt(fe)}")

p("\n== E. Highlights: scene with a disc of radiance 6, sensor clips at radiance 3 (full well = 3 P), A=4, read=3, P=1000, no motion, 8 frames")
p("method | PSNR (dB) | highlight (disc) mean radiance estimate (true 6)")
P, Af, rf = 1000.0, 4, 3.0
fw_l = 3.0 * P
s_s, fw_s = P / Af, fw_l / Af
names = ("large, 1 frame", "large, 8-frame bracket", "small, 8 equal frames", "small, 8-frame bracket")
rows = {k: [] for k in names}
hl = {k: [] for k in names}
brk = [1.0, 0.5, 0.25, 0.125] * 2
for sd in range(TRIALS):
    rng = np.random.default_rng(5000 + sd)
    canvas, truth = scene(sd, hdr=6.0)
    disc = truth > 5.0
    cases = {
        names[0]: ([capture(truth, P, fw_l, rf, rng)], [1.0], P, fw_l),
        names[1]: ([capture(truth, P * t, fw_l, rf, rng) for t in brk], brk, P, fw_l),
        names[2]: ([capture(truth, s_s, fw_s, rf, rng) for _ in range(8)], [1.0] * 8, s_s, fw_s),
        names[3]: ([capture(truth, s_s * t, fw_s, rf, rng) for t in brk], brk, s_s, fw_s),
    }
    for k, (fr, ts, sc, fw) in cases.items():
        est = merge(fr, ts, sc, fw, [(0.0, 0.0)] * len(fr))
        rows[k].append(display_psnr(est, truth, peak=6.0))
        hl[k].append(est[disc].mean())
for k in names:
    p(f"{k} | {np.mean(rows[k]):.2f} | {np.mean(hl[k]):.2f}")

open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
