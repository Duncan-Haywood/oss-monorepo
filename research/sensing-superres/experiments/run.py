"""Writes experiments/results.txt. Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_superres import (make_canvas, lr_frame, hr_truth, capture, estimate_shift, solve_ls,
                              bilinear_up, merge_register, psnr, nyquist_energy)

HERE = os.path.dirname(__file__)
SIZE, U, READ = 32, 12, 3.0
TRIALS = 10
TUNE = [100, 101]
LAMS = [1e-4, 1e-3, 3e-3, 1e-2, 3e-2]
out = []


def p(s=""):
    print(s)
    out.append(s)


def burst(seed, f, s, N, sigma=0.0):
    """One scene and burst. Returns truth, frames, true offsets (canvas px), and rng."""
    rng = np.random.default_rng(seed * 7919 + N)
    c = make_canvas(SIZE, U, seed=seed)
    H = hr_truth(c, U, f, SIZE)
    sh = [(0, 0)] + [tuple(int(v) for v in rng.integers(0, 2 * U, 2)) for _ in range(N - 1)]
    fr = [capture(lr_frame(c, t, U, SIZE), s, READ, rng) for t in sh]
    return H, fr, sh, rng


def offsets(f, shifts_lr):
    return [(int(round(f * a)), int(round(f * b))) for a, b in shifts_lr]


def methods(seed, f, s, N, lam, sigma=0.0):
    H, fr, sh, rng = burst(seed, f, s, N)
    true_lr = [(a / U, b / U) for a, b in sh]
    est_lr = [(0.0, 0.0)] + [estimate_shift(fr[0], y) for y in fr[1:]]
    # estimate_shift returns the shift that maps frame k onto frame 0, i.e. the content offset +true
    res = {}
    err = [np.hypot(e[0] - t[0], e[1] - t[1]) for e, t in zip(est_lr[1:], true_lr[1:])]
    res["est_err"] = float(np.sqrt(np.mean(np.square(err)))) if err else 0.0
    res["single"] = psnr(bilinear_up(fr[0], f), H, crop=2 * f)
    mer_est = bilinear_up(merge_register(fr, est_lr), f)
    res["merge_up"] = psnr(mer_est, H, crop=2 * f)
    orc = [(a + sigma * rng.standard_normal(), b + sigma * rng.standard_normal()) if k else (0.0, 0.0)
           for k, (a, b) in enumerate(true_lr)]
    res["sr_oracle"] = psnr(solve_ls(fr, offsets(f, orc), f, lam, mer_est), H, crop=2 * f)
    res["sr_est"] = psnr(solve_ls(fr, offsets(f, est_lr), f, lam, mer_est), H, crop=2 * f)
    mer_lr = merge_register(fr, est_lr)
    res["deblur_up"] = max(psnr(solve_ls([mer_lr], [(0, 0)], f, l2, mer_est), H, crop=2 * f) for l2 in LAMS)
    hr = capture(H, s / f ** 2, READ, rng)
    res["hr1"] = psnr(hr, H, crop=2 * f)
    hrN = np.mean([capture(H, s / f ** 2, READ, rng) for _ in range(N)], axis=0)
    res["hrN"] = psnr(hrN, H, crop=2 * f)
    return res


def mean(f, s, N, lam, seeds, sigma=0.0):
    rs = [methods(sd, f, s, N, lam, sigma) for sd in seeds]
    return {k: float(np.mean([r[k] for r in rs])) for k in rs[0]}


def tune(f, s, N, sigma=0.0):
    best = max(LAMS, key=lambda lam: mean(f, s, N, lam, TUNE, sigma)["sr_est" if sigma == 0 else "sr_oracle"])
    return best


SEEDS = list(range(TRIALS))
p("sensing-superres results. %d scenes, %dx%d LR px, canvas %d px per LR px, read noise %.0f e-." % (TRIALS, SIZE, SIZE, U, READ))
p("Lambda (smoothness weight) chosen per row from %s on scenes %s; PSNR on scenes 0..%d, peak 1.0. deblur_up takes the best lambda on the test scenes themselves (favours the baseline)." % (LAMS, TUNE, TRIALS - 1))
H0 = [hr_truth(make_canvas(SIZE, U, seed=sd), U, 2, SIZE) for sd in SEEDS]
p("mean fraction of target spectral energy beyond the LR Nyquist rate (f=2): %.3f" % np.mean([nyquist_energy(h, 2) for h in H0]))
p()

f, s = 2, 300.0
p("== E1. PSNR (dB) against burst length N: f=2, s=300 e- per LR pixel per unit radiance, true shifts uniform over 2 LR px")
p("N single merge_up deblur_up sr_oracle sr_est hr1 hrN lam est_rmse_LRpx")
e1 = {}
for N in [1, 2, 4, 8, 16, 32]:
    lam = tune(f, s, N) if N > 1 else LAMS[1]
    r = mean(f, s, N, lam, SEEDS)
    e1[N] = r
    p("%d %.2f %.2f %.2f %.2f %.2f %.2f %.2f %g %.3f" % (N, r["single"], r["merge_up"], r["deblur_up"], r["sr_oracle"], r["sr_est"], r["hr1"], r["hrN"], lam, r["est_err"]))
p()

p("== E2. Shift error: N=16, f=2, s=300, oracle shifts plus Gaussian error of sd sigma (LR px) before rounding to HR px")
p("sigma merge_up deblur_up sr_oracle lam")
for sg in [0.0, 0.05, 0.1, 0.2, 0.3, 0.5]:
    lam = tune(f, s, 16, sg)
    r = mean(f, s, 16, lam, SEEDS, sg)
    p("%.2f %.2f %.2f %.2f %g" % (sg, r["merge_up"], r["deblur_up"], r["sr_oracle"], lam))
p()

p("== E3. Zoom factor and light: PSNR (dB), estimated shifts")
p("f s N merge_up deblur_up sr_est hr1 hrN")
for f3 in [2, 3, 4]:
    for s3 in [30.0, 300.0]:
        for N3 in [16, 32]:
            lam = tune(f3, s3, N3)
            r = mean(f3, s3, N3, lam, SEEDS)
            p("%d %g %d %.2f %.2f %.2f %.2f %.2f" % (f3, s3, N3, r["merge_up"], r["deblur_up"], r["sr_est"], r["hr1"], r["hrN"]))

open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
