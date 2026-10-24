"""Writes experiments/results_diag.txt: (D) a looser search bound, (E) an oracle alignment ceiling.
Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostalign import (make_canvas, render_frame, capture, object_mask, merge_refguided,
                                merge_aligned_pair, masked_psnr)

SIZE, TRIALS = 48, 16
READ, P = 3.0, 300.0
S = P / 4
core = np.zeros((SIZE, SIZE), bool)
core[6:-6, 6:-6] = True
out = []


def p(s=""):
    print(s)
    out.append(s)


def burst(sd, n, v):
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(5000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    return canvas, clean, e


def disc_core(canvas):
    """Frame-0 subject footprint eroded by 2 px: pixels whose whole 5x5 neighbourhood is the subject."""
    m = object_mask(canvas, 1, 0.0, grow=0)
    q = np.pad(m, 2)
    k = np.ones_like(m)
    for dy in range(5):
        for dx in range(5):
            k &= q[dy:dy + SIZE, dx:dx + SIZE]
    return k & core


def oracle(e, v):
    """Frame i sampled at the true integer shift (x + v*i) for every pixel: exact for the subject,
    wrong for the background (which does not move), so it is only scored on the subject's frame-0 footprint."""
    n = e.shape[0]
    acc = np.zeros_like(e[0])
    for i in range(n):
        acc += np.roll(e[i], -int(round(v * i)), axis=1)
    return acc / n / S


p("# sensing-ghostalign diagnostics (synthetic, 16 scenes per cell, N = 8, A = 4, read 3 e-)")
p("\n== D. Search bound: oracle (v_max = v + 0.5) against a loose bound (v_max = 4), true speed v = 1")
p("bound | all | static | trail | obj0   (aligned+rej)")
for label, vm in [("oracle 1.5", 1.5), ("loose 4", 4.0)]:
    acc = []
    for sd in range(TRIALS):
        canvas, clean, e = burst(sd, 8, 1.0)
        masks = [core, ~object_mask(canvas, 8, 1.0, grow=2) & core, object_mask(canvas, 8, 1.0) & core,
                 object_mask(canvas, 1, 0.0) & core]
        est = merge_aligned_pair(e, S, READ, v_max=vm)[1]
        acc.append([masked_psnr(est, clean[0], m) for m in masks])
    p(f"{label} | " + " | ".join(f"{x:.2f}" for x in np.mean(acc, axis=0)))

p("\n== E. Ceiling: subject footprint (obj0) PSNR against N at v = 1, noise only (integer-shift oracle)")
p("N | region | oracle shift | aligned+rej | refguided | one large frame")
p("(obj0 = footprint +1 px ring, which includes background that the oracle shifts wrongly; disc core = footprint eroded 2 px)")
for n in [4, 8, 16, 24]:
    a = []
    for sd in range(TRIALS):
        canvas, clean, e = burst(sd, n, 1.0)
        rng = np.random.default_rng(9000 + sd)
        big = capture(clean[0], P, READ, rng) / P
        ests = [oracle(e, 1.0), merge_aligned_pair(e, S, READ, v_max=1.5)[1], merge_refguided(e, S, READ), big]
        a.append([[masked_psnr(x, clean[0], m) for x in ests]
                  for m in (object_mask(canvas, 1, 0.0) & core, disc_core(canvas))])
    a = np.mean(a, axis=0)
    for name, row in zip(["obj0", "disc core"], a):
        p(f"{n} | {name} | " + " | ".join(f"{x:.2f}" for x in row))

open(os.path.join(os.path.dirname(__file__), "results_diag.txt"), "w").write("\n".join(out) + "\n")
