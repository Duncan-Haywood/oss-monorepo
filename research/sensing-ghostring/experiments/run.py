"""Writes experiments/results.txt. Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostring import (make_canvas, render_frame, capture, object_mask, merge_refguided, merge_mean,
                               merge_aligned_pair, combine, subject_mask, erode, dilate, masked_psnr)

SIZE, TRIALS = 48, 12
A, READ, P = 4, 3.0, 300.0
S = P / A
B = 6
core = np.zeros((SIZE, SIZE), bool)
core[B:-B, B:-B] = True
REGIONS = ["all", "static", "ring", "disc"]
NAMES = ["mean", "refguided", "aligned+rej", "band", "median", "ring=aligned", "ring=reject", "large"]
out = []


def p(s=""):
    print(s)
    out.append(s)


def trial(sd, n, v, band=1):
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(7000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    truth = clean[0]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    big = capture(truth, P, READ, rng) / P
    foot = object_mask(canvas, 1, 0.0, grow=0)
    masks = [core, ~object_mask(canvas, n, v, grow=2) & core,
             dilate(foot, 1) & ~erode(foot, 2) & core,      # the edge ring of the frame-0 footprint
             erode(foot, 2) & core]
    al = merge_aligned_pair(e, S, READ, v_max=v + 0.5)[1]
    rg = merge_refguided(e, S, READ)
    est = {"mean": merge_mean(e, S, READ), "refguided": rg, "aligned+rej": al, "large": big}
    for nm, mode in [("band", "band"), ("median", "median"), ("ring=aligned", "aligned"), ("ring=reject", "reject")]:
        est[nm] = combine(e, S, READ, al, rg, mode=mode, band=band)
    m = subject_mask(e, READ)
    seg = [float((m & foot).sum() / foot.sum()), float((m & ~dilate(foot, 2) & core).sum() / (~dilate(foot, 2) & core).sum())]
    return {k: [masked_psnr(x, truth, mk) for mk in masks] for k, x in est.items()}, seg


def avg(n, v, **kw):
    acc, segs = {}, []
    for sd in range(TRIALS):
        r, sg = trial(sd, n, v, **kw)
        segs.append(sg)
        for m, t in r.items():
            acc.setdefault(m, []).append(t)
    return {m: np.mean(a, axis=0) for m, a in acc.items()}, np.mean(segs, axis=0)


p("# sensing-ghostring: handling the edge ring of a moving subject in a burst merge (synthetic, Poisson-Gaussian noise)")
p(f"{SIZE}x{SIZE} px scenes, {TRIALS} scenes per cell, still camera, one disc (radius 4 px) moving along x at v px per frame.")
p(f"A = {A}, read = {READ:g} e-, P = {P:g} e- per unit radiance in one large frame (small frame: {S:g}). Truth = noise-free frame 0. Display PSNR, border cropped.")
p("ring = pixels within 1 px outside to 2 px inside the frame-0 footprint edge; disc = footprint eroded by 2 px; static = never within 2 px of the subject.")
p("band/median/ring=aligned/ring=reject: aligned+rej inside the estimated subject mask, refguided outside it, and in the 1-px band around the mask edge: frame 0 / temporal median / aligned+rej / refguided.")
for title, cells in [("A. against subject speed, N = 8", [(8, v) for v in [0.5, 1.0, 2.0, 4.0]]),
                     ("B. against frames merged, v = 2 px per frame", [(n, 2.0) for n in [4, 8, 16]])]:
    p(f"\n== {title}")
    p("N | v | region | " + " | ".join(NAMES) + " (dB)")
    for n, v in cells:
        r, sg = avg(n, v)
        for j, reg in enumerate(REGIONS):
            p(f"{n} | {v:g} | {reg} | " + " | ".join(f"{r[m][j]:.2f}" for m in NAMES))
        p(f"{n} | {v:g} | mask recall in footprint {sg[0]:.2f}, false-positive rate far from subject {sg[1]:.3f}")

p("\n== C. band width, N = 8, v = 2 (mode band)")
p("band | " + " | ".join(REGIONS))
for band in [0, 1, 2]:
    acc = []
    for sd in range(TRIALS):
        r, _ = trial(sd, 8, 2.0, band=band)
        acc.append(r["band"])
    p(f"{band} | " + " | ".join(f"{x:.2f}" for x in np.mean(acc, axis=0)))

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
