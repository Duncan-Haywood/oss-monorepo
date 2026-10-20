"""Writes experiments/results.txt. Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostalign import (make_canvas, render_frame, capture, object_mask, merge_mean, merge_refguided,
                                merge_aligned_pair, masked_psnr)

SIZE = 48
TRIALS = 16
A, READ, P = 4, 3.0, 300.0
S = P / A
BORDER = 6
core = np.zeros((SIZE, SIZE), bool)
core[BORDER:-BORDER, BORDER:-BORDER] = True
REGIONS = ["all", "static", "trail", "obj0"]
NAMES = ["mean", "refguided", "aligned", "aligned+rej", "large"]
out = []


def p(s=""):
    print(s)
    out.append(s)


def trial(sd, n, v, margin=40.0, win=4):
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(5000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    truth = clean[0]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    big = capture(truth, P, READ, rng) / P
    masks = [core,
             ~object_mask(canvas, n, v, grow=2) & core,
             object_mask(canvas, n, v) & core,
             object_mask(canvas, 1, 0.0) & core]       # where the subject is in frame 0
    al, alr = merge_aligned_pair(e, S, READ, v_max=v + 0.5, margin=margin, win=win)
    est = {"mean": merge_mean(e, S, READ), "refguided": merge_refguided(e, S, READ),
           "aligned": al, "aligned+rej": alr, "large": big}
    return {m: [masked_psnr(x, truth, mk) for mk in masks] for m, x in est.items()}


def avg(n, v, **kw):
    acc = {}
    for sd in range(TRIALS):
        for m, t in trial(sd, n, v, **kw).items():
            acc.setdefault(m, []).append(t)
    return {m: np.mean(a, axis=0) for m, a in acc.items()}


p("# sensing-ghostalign: motion-compensated burst merging of a moving subject (synthetic, Poisson-Gaussian noise)")
p(f"{SIZE}x{SIZE} px scenes, {TRIALS} scenes per cell, still camera, one bright disc (radius 4 px) moving along x at v px per frame.")
p(f"A = {A}, read = {READ:g} e-, P = {P:g} e- per unit radiance in one large frame (small frame: {S:g}). Truth = noise-free frame 0.")
p("Display PSNR (gamma 1/2.2, peak 1), border cropped. all = interior; static = never within 2 px of the subject; trail = any touched pixel (+1 px);")
p("obj0 = the subject's footprint in frame 0 (+1 px). Alignment: per-pixel search, dy +-2 px, dx +-(0.5+v*i+0.5) px, 0.5 px steps, 9x9 window, margin 40 chi-square units.")
p("The horizontal search bound uses the true speed v (an oracle); section D relaxes it.")

p("\n== A. PSNR (dB) against subject speed, N = 8 frames")
p("v | region | " + " | ".join(NAMES))
for v in [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]:
    r = avg(8, v)
    for j, reg in enumerate(REGIONS):
        if v == 0.0 and reg in ("trail", "obj0"):
            continue
        p(f"{v:g} | {reg} | " + " | ".join(f"{r[m][j]:.2f}" for m in NAMES))

p("\n== B. PSNR (dB) against frames merged, v = 1 px per frame")
p("N | region | " + " | ".join(NAMES))
for n in [2, 4, 8, 16, 24]:
    r = avg(n, 1.0)
    for j, reg in enumerate(REGIONS):
        if reg in ("static",):
            continue
        p(f"{n} | {reg} | " + " | ".join(f"{r[m][j]:.2f}" for m in NAMES))

p("\n== C. Margin and window sweep, N = 8 (aligned+rej; refguided shown for reference)")
p("v | margin | win | all | static | trail | obj0")
for v in [0.0, 1.0]:
    rr = avg(8, v)["refguided"]
    p(f"{v:g} | refguided | - | " + " | ".join(f"{x:.2f}" for x in rr))
    for margin in [0.0, 20.0, 40.0, 80.0, 160.0]:
        for win in [2, 4]:
            r = avg(8, v, margin=margin, win=win)["aligned+rej"]
            p(f"{v:g} | {margin:g} | {win} | " + " | ".join(f"{x:.2f}" for x in r))

open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
