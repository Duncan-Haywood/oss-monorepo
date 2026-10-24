"""Writes experiments/results.txt. Synthetic scenes only; a few minutes on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_ghostedge import (make_canvas, render_frame, capture, object_mask, merge_refguided,
                               merge_aligned_pair, merge_edge, erode, dilate, masked_psnr)

SIZE, TRIALS = 48, 12
A, READ, P = 4, 3.0, 300.0
S = P / A
B = 6
core = np.zeros((SIZE, SIZE), bool)
core[B:-B, B:-B] = True
REGIONS = ["all", "static", "ring", "disc"]
NAMES = ["refguided", "aligned+rej", "layered-fit", "layered-oracle", "large"]
TRUE = (24.0, 8.0, 4.0)
out = []


def p(s=""):
    print(s)
    out.append(s)


def trial(sd, n, v, geom_err=None):
    canvas = make_canvas(SIZE, seed=sd)
    rng = np.random.default_rng(7000 + sd)
    clean = [render_frame(canvas, i, v) for i in range(n)]
    truth = clean[0]
    e = np.stack([capture(c, S, READ, rng) for c in clean])
    big = capture(truth, P, READ, rng) / P
    foot = object_mask(canvas, 1, 0.0, grow=0)
    masks = [core, ~object_mask(canvas, n, v, grow=2) & core,
             dilate(foot, 1) & ~erode(foot, 2) & core, erode(foot, 2) & core]
    al = merge_aligned_pair(e, S, READ, v_max=v + 0.5)[1]
    est = {"refguided": merge_refguided(e, S, READ), "aligned+rej": al, "large": big}
    if geom_err is None:
        est["layered-oracle"] = merge_edge(e, S, READ, al, v, geom=TRUE)[0]
        est["layered-fit"], g = merge_edge(e, S, READ, al, v)
        fit = (np.hypot(g[0] - TRUE[0], g[1] - TRUE[1]), abs(g[2] - TRUE[2])) if g else (np.nan, np.nan)
    else:
        dy, dx, dr = geom_err
        est["layered-oracle"] = merge_edge(e, S, READ, al, v, geom=(TRUE[0] + dy, TRUE[1] + dx, TRUE[2] + dr))[0]
        fit = (np.nan, np.nan)
    return {k: [masked_psnr(x, truth, mk) for mk in masks] for k, x in est.items()}, fit


def avg(n, v, **kw):
    acc, fits = {}, []
    for sd in range(TRIALS):
        r, f = trial(sd, n, v, **kw)
        fits.append(f)
        for m, t in r.items():
            acc.setdefault(m, []).append(t)
    return {m: np.mean(a, axis=0) for m, a in acc.items()}, np.array(fits)


p("# sensing-ghostedge: a layered sub-pixel coverage model for the edge ring of a moving subject (synthetic, Poisson-Gaussian noise)")
p(f"{SIZE}x{SIZE} px scenes, {TRIALS} scenes per cell, still camera, one disc (radius 4 px, centre (24, 8) in frame 0) moving along x at v px per frame.")
p(f"A = {A}, read = {READ:g} e-, P = {P:g} e- per unit radiance in one large frame (small frame: {S:g}). Truth = noise-free frame 0. Display PSNR, border cropped.")
p("ring = pixels within 1 px outside to 2 px inside the frame-0 footprint edge; disc = footprint eroded by 2 px; static = never within 2 px of the subject.")
p("layered-fit: disc centre and radius fitted to the burst; layered-oracle: true geometry. Both use the true speed v. Layered estimates replace aligned+rej within 3 px of the frame-0 disc.")
for title, cells in [("A. against subject speed, N = 8", [(8, v) for v in [0.5, 1.0, 2.0, 4.0]]),
                     ("B. against frames merged, v = 2 px per frame", [(n, 2.0) for n in [4, 8, 16]])]:
    p(f"\n== {title}")
    p("N | v | region | " + " | ".join(NAMES) + " (dB)")
    for n, v in cells:
        r, fits = avg(n, v)
        for j, reg in enumerate(REGIONS):
            p(f"{n} | {v:g} | {reg} | " + " | ".join(f"{r[m][j]:.2f}" for m in NAMES))
        ok = np.isfinite(fits[:, 0])
        good = ok & (fits[:, 0] < 0.5)
        p(f"{n} | {v:g} | fit: found {ok.sum()}/{TRIALS}, centre within 0.5 px {good.sum()}/{TRIALS}, "
          f"median centre error {np.nanmedian(fits[:, 0]):.2f} px, median radius error {np.nanmedian(fits[:, 1]):.2f} px")

p("\n== C. sensitivity to geometry error, N = 8, v = 2 (layered-oracle with a perturbed disc; ring dB)")
p("perturbation | ring | disc | all")
for nm, ge in [("none", (0, 0, 0)), ("centre +0.25 px x", (0, 0.25, 0)), ("centre +0.5 px x", (0, 0.5, 0)),
               ("centre +1 px x", (0, 1.0, 0)), ("centre +0.5 px y", (0.5, 0, 0)),
               ("radius +0.25 px", (0, 0, 0.25)), ("radius -0.5 px", (0, 0, -0.5))]:
    r, _ = avg(8, 2.0, geom_err=ge)
    x = r["layered-oracle"]
    p(f"{nm} | {x[2]:.2f} | {x[3]:.2f} | {x[0]:.2f}")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
